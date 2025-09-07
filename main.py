from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from pydantic import BaseModel
from utils.email_processor import process_email, get_abvrs, update_audiences_using_added_cohort
from utils.helper import get_forecast_data, get_cohorts
from utils.audience_selector import refresh_audience_embeddings, get_selected_audience_data_by_name
from typing import Dict, Any, List
import logging
from logging.handlers import TimedRotatingFileHandler
from dotenv import load_dotenv
from schedulers.scheduler import scheduler
import asyncio
import concurrent.futures
import uuid
from threading import Lock
import time
import sys
import os

# Load environment variables from .env file
load_dotenv()

def setup_logging():
    """Configure logging for FastAPI application"""
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    # Set up log rotation with better file naming
    file_handler = TimedRotatingFileHandler(
        'logs/app.log', 
        when='midnight', 
        interval=1, 
        backupCount=30,  # Keep 30 days of logs
        encoding='utf-8'
    )
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s'
    ))
    
    # Stream to console with colors for better readability
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    ))
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Remove any existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Configure specific loggers with appropriate levels
    loggers_config = {
        'uvicorn': logging.INFO,
        'uvicorn.access': logging.WARNING,  # Reduce access log noise
        'fastapi': logging.INFO,
        'utils.file_processor': logging.INFO,
        'utils.helper': logging.INFO,
        'utils.audience_selector': logging.INFO,
        'utils.email_processor': logging.INFO,
        'utils.similarity_based_rag': logging.INFO,
        'schedulers.scheduler': logging.INFO,
        'apscheduler': logging.WARNING,  # Reduce scheduler noise
        'sqlalchemy': logging.WARNING,  # If using SQLAlchemy
    }
    
    for logger_name, level in loggers_config.items():
        logging.getLogger(logger_name).setLevel(level)
    
    # Create application logger
    logger = logging.getLogger(__name__)
    logger.info("Logging configured successfully")
    
    return logger

# Setup logging
logger = setup_logging()

app = FastAPI(
    title="GAM Forecast API",
    description="API for processing email forecasts and audience data",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)
app.mount("/static", StaticFiles(directory="static"), name="static")
# Set up templates
templates = Jinja2Templates(directory="templates")
    
# Startup event to start the scheduler
@app.on_event("startup")
async def start_scheduler():
    """Start the scheduler when the FastAPI app starts"""
    scheduler.start()

# Shutdown event to stop the scheduler
@app.on_event("shutdown")
async def stop_scheduler():
    """Stop the scheduler when the FastAPI app shuts down"""
    scheduler.stop()
    
# Add a global variable to track background tasks
background_tasks = {}
tasks_lock = Lock()
executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)

class ForecastRequest(BaseModel):
    preset: List[str]
    creative_size: str
    device_category: str
    duration: int
    locations: List[Dict[str, Any]]
    abvrs: List[str]
    target_gender: str
    target_age: str

class AudienceSegmentRequest(BaseModel):
    name: str
    keywords: List[str]
    
class RefreshKeywordsRequest(BaseModel):
    keywords: List[str]
    cohorts: List[str]
    
class AddCohortRequest(BaseModel):
    keywords: List[str]
    cohorts: List[str]


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/scheduler-status")
async def get_scheduler_status():
    """Get the current status of the scheduler and its jobs"""
    try:
        return scheduler.get_status()
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/trigger-scheduled-refresh")
async def trigger_scheduled_refresh():
    """Manually trigger the audience embedding refresh job"""
    with tasks_lock:
        for task in background_tasks.values():
            if task["status"] == "running":
                return {
                "message": "A refresh task is already running. Try again later.",
                "status": "already_running"
            }
        
        # Generate a unique task ID
        task_id = str(uuid.uuid4())
        background_tasks[task_id] = {"status": "queued", "queued_at": time.time()}

    # Create a background task that doesn't block the response
    async def run_refresh_in_background():
        try:
            logger.info(f"Starting background refresh task {task_id}")
            with tasks_lock:
                background_tasks[task_id] = {"status": "running", "started_at": time.time()}

            loop = asyncio.get_running_loop()
            await loop.run_in_executor(executor, refresh_audience_embeddings)

            with tasks_lock:
                background_tasks[task_id] = {"status": "completed", "completed_at": time.time()}
            logger.info(f"Background refresh task {task_id} completed successfully")
        except Exception as e:
            with tasks_lock:
                background_tasks[task_id] = {
                    "status": "failed",
                    "error": str(e),
                    "failed_at": time.time()
                }
            logger.error(f"Background refresh task {task_id} failed: {e}")
            
    asyncio.create_task(run_refresh_in_background())

    return {
        "message": "Audience embedding refresh started in background",
        "status": "started",
        "task_id": task_id
    }

@app.get("/refresh-status/{task_id}")
async def get_refresh_status(task_id: str):
    """Get the status of a specific refresh task"""
    with tasks_lock:
        task = background_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.post("/get-abvrs-from-keywords")
async def get_abvrs_from_keywords_endpoint(refresh_keywords_request: RefreshKeywordsRequest) -> Dict[str, Any]:
    keywords_array, sorted_cohort_entries, selected_audiences, left_audiences = get_abvrs("", "", refresh_keywords_request.cohorts, refresh_keywords_request.keywords)
    return {
        "keywords": keywords_array,
        "cohort_abvrs": sorted_cohort_entries,
        "abvrs": selected_audiences,
        "left_abvrs": left_audiences
    }

@app.post("/add-cohort")
async def add_audiences_from_cohort_using_keywords(add_cohort_request: AddCohortRequest) -> List[Dict[str, Any]]:
    sorted_cohort_entries = update_audiences_using_added_cohort(add_cohort_request.cohorts, add_cohort_request.keywords)
    return sorted_cohort_entries

@app.post("/process-email")
async def process_email_endpoint(
    subject: str = Form(...),
    body: str = Form(...),
    files: List[UploadFile] = File([]),
    ) -> Dict[str, Any]:
    try:
        logger.info(f"Processing email with subject: {subject}")
        result = process_email(subject, body, files)
        logger.info(f"Process email result: {result}")
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except Exception as e:
        logger.exception("Error processing email")
        raise HTTPException(status_code=500, detail=str(e))
    return {
        'cohort': ['Small and Medium Industries'], 
        'locations': [{'includedLocations': [{"name": 'Rajasthan,IN,STATE',"id":20468}], 'excludedLocations': [], 'nameAsId': ''}, {'includedLocations': [{"name": 'Uttar Pradesh,IN,STATE',"id":20471}], 'excludedLocations': [], 'nameAsId': ''}, {'includedLocations': [{"name": 'Madhya Pradesh,IN,STATE',"id":20464}], 'excludedLocations': [], 'nameAsId': ''}, {'includedLocations': [{"name": 'Haryana,IN,STATE',"id":20458}], 'excludedLocations': [], 'nameAsId': ''}], 
        "locations_not_found": ["Flagship Locations", "NextWave Cities", "Anchor Locations", "Canada", "US+Canada"],
        'preset': ['TIL_All_Cluster_RNF'], 
        'creative_size': 'Banners', 
        'device_category': 'All Devices', 
        'duration': '30 Days', 
        'target_gender': 'Male',
        'target_age': '18-24',
        'cohort_abvrs': [{'name': 'Small and Medium Industries', 'description': 'Small and Medium Industries', 'abvr': 'sf5', 'similarity': 0.7218635824428371}],
        'abvrs': [{'name': 'Interest: Business & Industries > Agriculture', 'description': 'Interest: Business & Industries > Agriculture', 'abvr': 'sf6', 'similarity': 0.7218635824428371}, {'name': 'InM_IndiaMart-Agriculture & Farming', 'description': 'Users who have shown interest in buying Agriculture & Farming related products', 'abvr': 'rau', 'similarity': 0.7212520931986481}, {'name': 'CVOP_HOSACHIGURU ABHIVRUDHI FARMS LLP_74728_thankyou', 'description': 'Achievers of goal with Id: 6268', 'abvr': 'kzq', 'similarity': 0.48741199767924054}, {'name': 'CVOP_HOSACHIGURU ABHIVRUDHI FARMS LLP_10265_Landing Page', 'description': 'Achievers of goal with Id:10265', 'abvr': 'r8r', 'similarity': 0.4679547996157367}, {'name': 'Estimate_Home and Living & ET All Platform_Garden', 'description': 'Home and Living and ET All Platform_Garden audience', 'abvr': 'lw0', 'similarity': 0.45205695142777774}, {'name': 'Estimate_Home and Living & ET Web_Garden', 'description': 'Home and Living & ET Web_Garden audience', 'abvr': 'lz4', 'similarity': 0.44990271042102964}, {'name': 'UAC_Installed App - Education - Other Education - Plantix - your crop doctor', 'description': 'Individuals who have installed Plantix - your crop doctor app in their device', 'abvr': 'nbl', 'similarity': 0.4474044017879528}], 
        'left_abvrs': [{'name': 'InM_IndiaMart-Commercial Cooking Equipments', 'description': 'Users who have shown interest in Commercial Cooking Equipments related products', 'abvr': 'rcs', 'similarity': 0.528528012966879}, {'name': 'Interest: Business & Industries > Manufacturing', 'description': 'Interest: Business & Industries > Manufacturing', 'abvr': 'sfg', 'similarity': 0.5156111979109339}, {'name': 'InM_SD - Product - Food & Gourmet', 'description': 'Individuals looking for Food & Gourmet on an ecommerce site', 'abvr': 'fs7', 'similarity': 0.5047864674730148}, {'name': 'Industry_Food & Dining_Food delivery_Offer & Deals_Click', 'description': 'Users who click on ads or content about offers & deals in food delivery', 'abvr': 'myc', 'similarity': 0.5021729059112001}, {'name': 'Industry_Food & Dining_Food delivery_Click', 'description': 'Food & dining enthusiasts who click on ads or content about food delivery', 'abvr': 'myb', 'similarity': 0.4997579489900642}, {'name': 'Industry_Food & Dining_Food delivery_Offer & Deals_Impr', 'description': 'Users who view ads or content about offers & deals in food delivery', 'abvr': 'n5k', 'similarity': 0.49808052877743936}, {'name': 'InM_IndiaMart-Health & Pharmaceuticals-Health Food & Supplements', 'description': 'Users who have shown interest in Health Food & Supplements related products', 'abvr': 'rd1', 'similarity': 0.49420721283284386}, {'name': 'Interest: Business & Industries > Startups', 'description': 'Interest: Business & Industries > Startups', 'abvr': 'sfl', 'similarity': 0.49253251506447276}, {'name': 'Industry_FMCG_Foods & Beverages_Impr', 'description': 'FMCG industry enthusiasts who view ad or content about foods & beverages', 'abvr': 'n5b', 'similarity': 0.490923116255891}, {'name': 'Industry_Food & Dining_Food delivery_Impr', 'description': 'Food & dining enthusiasts who view ads or content about food delivery', 'abvr': 'n5j', 'similarity': 0.4904751336509535}, {'name': 'InM_IndiaMart-Industrial Supplies', 'description': 'Users who have shown interest in buying Industrial Supplies related products', 'abvr': 'rb6', 'similarity': 0.4896861200305149}, {'name': 'Industry_FMCG_Foods & Beverages_Click', 'description': 'FMCG industry enthusiasts who click on ad or content about foods & beverages', 'abvr': 'my3', 'similarity': 0.48784466046684233}, {'name': 'Industry_Shopping_Grocery_Click', 'description': 'Shopping enthusiasts who click on ad or content about grocery', 'abvr': 'n1h', 'similarity': 0.48619604957375817}, {'name': 'Industry_Shopping_Grocery_Impr', 'description': 'Shopping enthusiasts who view ad or content about grocery', 'abvr': 'n8p', 'similarity': 0.4850191038051811}, {'name': 'Interest: Shopping > Grocery', 'description': 'Interest: Shopping > Grocery', 'abvr': 'sjl', 'similarity': 0.4842001273737768}, {'name': 'Industry_Food & Dining_Click', 'description': 'Users who click on ads or content about food & dining', 'abvr': 'mya', 'similarity': 0.48397353134723786}, {'name': 'Industry_CAN_Food & Dining_Food delivery_Click', 'description': 'Food & dining enthusiasts who click on ads or content about food delivery on CAN Adserver', 'abvr': 'oq5', 'similarity': 0.48395705833291053}, {'name': 'InM_Mtag_Food_Online Food Delivery', 'description': 'People who search for and read articles related to Online Food Delivery and all other related keywords', 'abvr': 'nlc', 'similarity': 0.4835841410374824}, {'name': 'INT_Food & Beverage Products', 'description': 'Individuals interested in food and beverages', 'abvr': '8u1', 'similarity': 0.4831922966088095}, {'name': 'Industry_CAN_Food & Dining_Food delivery_Offer & Deals_Click', 'description': 'Users who click on ads or content about offers & deals in food delivery on CAN Adserver', 'abvr': 'oq6', 'similarity': 0.48295861867009304}, {'name': 'Industry_Food & Dining_Impr', 'description': 'Users who view ads or content about food & dining', 'abvr': 'n5i', 'similarity': 0.4826876844948196}, {'name': 'InM_IndiaMart-Health & Pharmaceuticals-Veterinary', 'description': 'Users who have shown interest in Veterinary products and services', 'abvr': 'rd6', 'similarity': 0.48156657505470235}, {'name': 'Package_Business and Industrial', 'description': 'People interested in Business or Manufacturing or Logistics or industry\xa0news or have business or industrial related apps on their device', 'abvr': 'r0t', 'similarity': 0.48149441626202105}, {'name': 'Interest: Business & Industries > Marketing and Advertising', 'description': 'Interest: Business & Industries > Marketing and Advertising', 'abvr': 'sfh', 'similarity': 0.4800159275284842}, {'name': 'Industry_CAN_Food & Dining_Food delivery_Offer & Deals_Impr', 'description': 'Users who view ads or content about offers & deals in food delivery on CAN Adserver', 'abvr': 'ox5', 'similarity': 0.47842245920145}, {'name': 'Estimate_Business & Industrial & United States', 'description': 'Users in the USA who have interest in Business Industrial', 'abvr': 'hte', 'similarity': 0.477952356681726}, {'name': 'Package_Real Estate - Interest', 'description': 'Individuals interested in real estate sector;browse websites to know about residential,commercial or agricultural properties at different locations.', 'abvr': 'ixf', 'similarity': 0.4769685128031179}, {'name': 'InM_IndiaMart-Food and Beverages', 'description': 'Users who have shown interest in buying Food and Beverages', 'abvr': 'rb3', 'similarity': 0.4757019524185562}, {'name': 'Interest: Business & Industries > Small and Medium-sized Business', 'description': 'Interest: Business & Industries > Small and Medium-sized Business', 'abvr': 'sfk', 'similarity': 0.4752669688662476}, {'name': 'Interest: Business & Industries', 'description': 'Interest: Business & Industries', 'abvr': 'sf5', 'similarity': 0.47520014264175137}, {'name': 'Industry_CAN_Food & Dining_Food delivery_Impr', 'description': 'Food & dining enthusiasts who view ads or content about food delivery on CAN Adserver', 'abvr': 'ox4', 'similarity': 0.4746787722160377}, {'name': 'Interest: FMCG > Foods & Beverages', 'description': 'Interest: FMCG > Foods & Beverages', 'abvr': 'sgx', 'similarity': 0.47303555544993997}, {'name': 'Industry_CAN_FMCG_Foods & Beverages_Impr', 'description': 'FMCG industry enthusiasts who view ad or content about foods & beverages on CAN Adserver', 'abvr': 'oww', 'similarity': 0.4720797685437641}, {'name': 'Industry_DFP_Food & Dining_Food delivery_Offer & Deals_Impr', 'description': 'Users who view ads or content about offers & deals in food delivery on DFP Adserver', 'abvr': 'pbh', 'similarity': 0.47189274565198536}, {'name': 'Industry_DFP_Food & Dining_Food delivery_Offer & Deals_Click', 'description': 'Users who click on ads or content about offers & deals in food delivery on DFP Adserver', 'abvr': 'p4i', 'similarity': 0.4710706183589995}, {'name': 'InM_SD - Product - Home & Living - Kitchen & Dining', 'description': 'Individuals looking for products for Kitchen & Dining on an ecommerce site', 'abvr': 'fse', 'similarity': 0.47062385148008556}, {'name': 'Industry_CAN_Shopping_Grocery_Impr', 'description': 'Shopping enthusiasts who view ad or content about grocery on CAN Adserver', 'abvr': 'p07', 'similarity': 0.4701922957822314}, {'name': 'InM_IndiaMart-Real Estate', 'description': 'Users who have shown interest in Real Estate related products and services', 'abvr': 'rda', 'similarity': 0.4697760878750493}, {'name': 'Industry_CAN_FMCG_Foods & Beverages_Click', 'description': 'FMCG industry enthusiasts who click on ad or content about foods & beverages on CAN Adserver', 'abvr': 'opx', 'similarity': 0.46943815819532664}, {'name': 'Interest: Business & Industries > Retail', 'description': 'Interest: Business & Industries > Retail', 'abvr': 'sfj', 'similarity': 0.46913095080856443}, {'name': 'Interest - Business and Industry Savvy', 'description': 'Individuals who are keen to get business and industrial updates.', 'abvr': '30s', 'similarity': 0.4687830614876975}, {'name': 'Industry_DFP_FMCG_Foods & Beverages_Impr', 'description': 'FMCG industry enthusiasts who view ad or content about foods & beverages on DFP Adserver', 'abvr': 'pb8', 'similarity': 0.46876682532655234}, {'name': 'Interest: Food & Dining', 'description': 'Interest: Food & Dining', 'abvr': 'sh3', 'similarity': 0.4686270895227772}, {'name': 'Industry_DFP_Food & Dining_Food delivery_Click', 'description': 'Food & dining enthusiasts who click on ads or content about food delivery on DFP Adserver', 'abvr': 'p4h', 'similarity': 0.4684390623386164}, {'name': 'Industry_DFP_FMCG_Foods & Beverages_Click', 'description': 'FMCG industry enthusiasts who click on ad or content about foods & beverages on DFP Adserver', 'abvr': 'p49', 'similarity': 0.46785404890855475}, {'name': 'INT_Manufacturing Business', 'description': 'Individuals interested in news of manufacturing sector', 'abvr': 'hst', 'similarity': 0.4667949554730183}, {'name': 'Industry_CAN_Shopping_Grocery_Click', 'description': 'Shopping enthusiasts who click on ad or content about grocery on CAN Adserver', 'abvr': 'ot8', 'similarity': 0.4667598954898661}, {'name': 'Interest: Business & Industries > Government Projects', 'description': 'Interest: Business & Industries > Government Projects', 'abvr': 'sfb', 'similarity': 0.4660308328420023}, {'name': 'Industry_CAN_Food & Dining_Click', 'description': 'Users who click on ads or content about food & dining on CAN Adserver', 'abvr': 'oq4', 'similarity': 0.4652107083251249}, {'name': 'Industry_DFP_Food & Dining_Food delivery_Impr', 'description': 'Food & dining enthusiasts who view ads or content about food delivery on DFP Adserver', 'abvr': 'pbg', 'similarity': 0.46366108777798304}, {'name': 'InM_Mtag_Food_Recipes_Vegetarian', 'description': 'People who search for and read articles related to Vegetarian Food Recipes and all other related keywords', 'abvr': 'nlf', 'similarity': 0.46322217997541587}, {'name': 'Interest: Business & Industries > Logistics and Transportation', 'description': 'Interest: Business & Industries > Logistics and Transportation', 'abvr': 'sff', 'similarity': 0.4615705540653223}, {'name': 'Industry_CAN_Food & Dining_Impr', 'description': 'Users who view ads or content about food & dining on CAN Adserver', 'abvr': 'ox3', 'similarity': 0.46139618216393635}, {'name': 'InM_Mtag_Food_Recipes', 'description': 'People who search for and read articles related to Food Recipes and all other related keywords', 'abvr': 'nld', 'similarity': 0.46086988604488244}, {'name': 'InM_Mtag_Food', 'description': 'People who search for and read articles related to restaurant, recipes, ingredient, online food delivery and all other related keywords', 'abvr': 'nlb', 'similarity': 0.4602198078359053}, {'name': 'Custom - Foodies', 'description': '*Custom - $ Foodies', 'abvr': '431', 'similarity': 0.45933239857984737}, {'name': 'Industry_DFP_Food & Dining_Impr', 'description': 'Users who view ads or content about food & dining on DFP Adserver', 'abvr': 'pbf', 'similarity': 0.45811889163199926}, {'name': 'Industry_DFP_Food & Dining_Click', 'description': 'Users who click on ads or content about food & dining on DFP Adserver', 'abvr': 'p4g', 'similarity': 0.4579342454351218}, {'name': 'Industry_DFP_Shopping_Grocery_Impr', 'description': 'Shopping enthusiasts who view ad or content about grocery on DFP Adserver', 'abvr': 'pej', 'similarity': 0.45736087879296755}, {'name': 'Estimate_Business and Industrial & ET AOS', 'description': 'ET AOS business and industrial audience', 'abvr': 'm1a', 'similarity': 0.4573170749672705}, {'name': 'InM_IndiaMart-Education & Training', 'description': 'Users who have shown interest in Education & Training related products', 'abvr': 'rb0', 'similarity': 0.4560231301785566}, {'name': 'Estimate_Business and Industrial & ET AOS_Economy', 'description': 'Business and Industrial & ET AOS_Economy audience', 'abvr': 'm2x', 'similarity': 0.45530215421265896}, {'name': 'Interest: Food & Dining > Restaurant', 'description': 'Interest: Food & Dining > Restaurant', 'abvr': 'sh4', 'similarity': 0.45451612801333435}, {'name': 'NIU_UAC_Shows_Genre_Food & Cooking', 'description': 'Not in Use Audiences', 'abvr': 'nfh', 'similarity': 0.4534721668761485}, {'name': 'InM_IndiaMart-Industrial Supplies-Machines and Tools', 'description': 'Users who have shown interest in buying Industrial machines and tools', 'abvr': 'rk0', 'similarity': 0.45281191009609906}, {'name': 'Estimate_Food & Drink & ET AOS', 'description': 'ET AOS food & drink audience', 'abvr': 'm1p', 'similarity': 0.45260405976879603}, {'name': 'Advertiser - FUTURE CORPORATE', 'description': 'Advertiser - FUTURE CORPORATE', 'abvr': '9qw', 'similarity': 0.4523184754263485}, {'name': 'InM_IndiaMart-Health & Pharmaceuticals', 'description': 'Users who have shown interest in Health & Pharmaceutical products', 'abvr': 'rcz', 'similarity': 0.4521467712029198}, {'name': 'Industry_DFP_Shopping_Grocery_Click', 'description': 'Shopping enthusiasts who click on ad or content about grocery on DFP Adserver', 'abvr': 'p7k', 'similarity': 0.45048390202368005}, {'name': 'Custom - Business Decision Makers', 'description': 'Business Owners', 'abvr': '5ms', 'similarity': 0.4500485185580737}],
        'keywords': ['Farmers', 'Agri based businesses', 'Agriculture industry', 'Farm owners', 'Agricultural products', 'Crop cultivation', 'Agricultural equipment', 'Farm management']}

@app.post("/get-forecast")
async def get_forecast_endpoint(forecast_request: ForecastRequest) -> Dict[str, Any]:
    try:
        logger.info(f"Processing forecast: {forecast_request}")
        abvr_set = []
        seen = set()
                    
        for abvr in forecast_request.abvrs:
            abvr = abvr.strip()
            if abvr and abvr not in seen:
                abvr_set.append(abvr)
                seen.add(abvr)

        abvrs_limited = abvr_set[:200]
        abvrs = ",".join(abvrs_limited)
        
        result = get_forecast_data(abvrs, forecast_request.locations, forecast_request.preset, forecast_request.creative_size, forecast_request.device_category, forecast_request.duration, forecast_request.target_gender, forecast_request.target_age)
        logger.info(f"Process forecast result: {result}")
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except Exception as e:
        logger.exception("Error getting forecast")
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "TIL": {
            "India": {
            "user": 223.86,
            "impr": 785.75
            }
        },
        "ET": {
            "India": {
            "user": 22.86,
            "impr": 78.75
            }
        }
    }

@app.post("/get-audience-segment-by-name")
async def get_audience_segment_by_name(request: AudienceSegmentRequest) -> List[Dict[str, Any]]:
    return get_selected_audience_data_by_name(request.name, request.keywords)