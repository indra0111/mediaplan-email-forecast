import google.generativeai as genai
import os
import json
from dotenv import load_dotenv
from utils.helper import get_cohorts, parse_locations_dict
from utils.audience_selector import get_relevant_keywords, get_filtered_audience_data, check_cache_validity, find_relevant_entries
from utils.file_processor import FileProcessor
import logging
from typing import Any, List
from fastapi import UploadFile
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configure Gemini API
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))

# Initialize Gemini model
model = genai.GenerativeModel(os.getenv('GEMINI_MODEL'))


def get_response(subject, body, cohorts):
    prompt = f"""
        You are an intelligent assistant designed to classify email requests into relevant ad cohorts, locations, presets, and creative formats.

        ---

        📩 **Email Details**
        - Subject: {subject}
        - Body: {body}

        ---

        📚 **Available Cohorts**
        {cohorts}

        ---

        🎨 **Available Creative Sizes**
        ["Banners", "Interstitial", "Skinning", "Top Banner"]

        🎛️ **Available Presets**
        ["TIL_All_Cluster_RNF", "TIL_TOI_Only_RNF", "TIL_ET_Only_RNF", "TIL_ET_And_TOI_RNF",
        "TIL_NBT_Only_RNF", "TIL_MT_Only_RNF", "TIL_VK_Only_RNF", "TIL_IAG_Only_RNF",
        "TIL_EIS_Only_RNF", "TIL_Tamil_Only_RNF", "TIL_Telugu_Only_RNF",
        "TIL_Malayalam_Only_RNF", "TIL_All_Languages_RNF"]

        🎯 **Available Target Ages**
        ["18-24", "25-34", "35-44", "45-54", "55+", "All"]

        🎯 **Available Target Genders**
        ["Male", "Female", "All"]

        ---

        📦 **Expected Response Format (JSON only)**

        Return your response strictly as a **valid JSON object** in the following structure:

        ```json
        {{
        "cohort": ["cohort_name1","cohort_name2"]                        // Relevant cohort names
        "locations": [
            {{
            "includedLocations": ["location1", "location2", ...],
            "excludedLocations": ["location3", "location4", ...],
            "nameAsId": "location_name1"  // specify a name for this response location
            }},
            {{
            "includedLocations": ["location5", "location6", ...],
            "excludedLocations": [],
            "nameAsId": "location_name2"  // specify a name for this response location
            }}
        ],
        "preset": ["preset_name1", "preset_name2"],     // Choose most relevant preset(s)
        "creative_size": "creative_name"                // Choose one from the creative size list
        "device_category": "Mobile",
        "target_gender": "Male", // Choose one from the available target genders
        "target_age": ["18-24", "25-34"], // Choose one or more from the available target ages
        "duration": 30
        }}
        ```
        Choose TIL_All_Cluster_RNF as default preset if nothing is related to preset in the request.
        Choose Banners as the default creative size if nothing is related to creative size in the request.
        
        For locations, if shorthand notations like 2 letter state codes are used, expand them to full state names.
        Location items should be dictionaries with `includedLocations`, `excludedLocations` and `nameAsId` keys. The key nameAsId is mandatory if size of includedLocations array is not 1 or excludedLocations array size is greater than 0 else it can be left as blank. Do not group multiple locations into one includedLocation list unless they are explicitly mentioned as a single phrase (e.g., "Delhi NCR", "Tier 1 Cities"). Treat each region or state as a separate location dictionary (e.g., "Uttar Pradesh", "Haryana", "Top Metro city" should be separate). If exclusions are mentioned, apply them only to the relevant included region. nameAsId is required when excludedLocations is non-empty or includedLocations has more than one region. Otherwise, it can be left blank. Ensure nameAsId is unique across location objects when present.
        
        For devices, you can specify "Mobile", "Desktop", or "All" based on the request context. If device category is not specified, take it as "All. If duration is not specified, take it as 30 days else take the specified duration.".
    """
    # Generate response
    response = model.generate_content(prompt)
    cleaned_text = response.text.replace('```json', '').replace('```', '').strip()
    # Parse the response text into JSON
    try:
        response_json = json.loads(cleaned_text)
        return response_json
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON response: {e}")
        return None

def get_filtered_audience_names_from_llm(keywords, audience_names):
    audience_list_str = "\n".join([f"- {name}" for name in audience_names])
    prompt = f"""
        You are an intelligent assistant designed to select the most relevant audience names from a list, based on a user's intent.

        🎯 **User Intent**
        "{keywords}"

        📚 **Available Audiences**
        {audience_list_str}

        🔍 **Task**
        From the above list, select the most relevant audience names that best match the user's intent. Choose as many as possible given they are relevant to the user's intent.
        Rank them by relevance, with the most relevant audience first.

        🛑 **Important Rules**
        - Only choose from the audience names listed above.
        - Do not invent new audience names.
        - The output **must** be valid JSON and follow the structure exactly.

        📦 **Expected Response Format**
        ```json
        {{
        "audiences": [
            "audience1",
            "audience2",
            ...
            ]
        }}
    """
    # Generate response
    response = model.generate_content(prompt)
    cleaned_text = response.text.replace('```json', '').replace('```', '').strip()
    # Parse the response text into JSON
    try:
        response_json = json.loads(cleaned_text)
        logger.info(f"Response JSON: {response_json}")
        return response_json['audiences']
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON response: {e}")
        return None
    
def process_top_k_selected_audiences(top_k_selected_audiences, keywords):
    # strip_embeddings_and_export_to_csv(top_k_selected_audiences, "audience_data.csv")
    all_audience_names = [d.get('name') for d in top_k_selected_audiences]
    selected_audience_names = get_filtered_audience_names_from_llm(keywords, all_audience_names)
    logger.info(f"Selected audience names: {selected_audience_names}")
    # Create a set for faster lookup
    selected_name_set = set(selected_audience_names)

    # Split into selected and left audiences
    selected_audiences = []
    left_audiences = []

    for d in top_k_selected_audiences:
        if all(k in d for k in ('name', 'description', 'abvr', 'similarity')):
            audience_data = {
                'name': d['name'],
                'description': d['description'],
                'abvr': d['abvr'],
                'similarity': float(d.get('similarity', 0))
            }
            if d['name'] in selected_name_set:
                selected_audiences.append(audience_data)
            else:
                left_audiences.append(audience_data)
    return selected_audiences, left_audiences

def get_abvrs(email_subject, email_body, cohorts=[], keywords_array=None):
    all_audience_data = get_filtered_audience_data(cohorts)

    if not all_audience_data:
        logger.info("Error: Could not retrieve audience data from database")
        exit(1)

    logger.info(f"Loaded {len(all_audience_data)} audience entries")

    # Check cache status
    cache_valid, cache_message = check_cache_validity()
    logger.info(f"Cache status: {cache_message}")

    if keywords_array is None:
        response = get_relevant_keywords(email_subject, email_body)
        if not response or 'relevant_entries' not in response:
            logger.error("Error: Could not extract relevant keywords from email")
            exit(1)
        keywords_array = response['relevant_entries']
        

    logger.info(f"Extracted keywords: {keywords_array}")

    # Find relevant entries (will use cache if available)
    logger.info(f"\nFinding relevant entries...")
    results = find_relevant_entries(keywords_array, all_audience_data)
    logger.info(f"Results: {len(results)}")
    if not results:
        logger.info("Warning: No relevant entries found")
    else:
        selected_audiences, left_audiences = process_top_k_selected_audiences(results, keywords_array)
        return keywords_array, selected_audiences, left_audiences
    
    return None, None, None


def process_email(subject: str, body: str, files: List[UploadFile]) -> Any:
    file_contents = []
    extracted_keywords = []
    for file in files:
        if file.filename:
            logger.info(f"Processing attachment: {file.filename}")
            file_data = FileProcessor.process_file(file)
            file_contents.append(file_data)
            
            # Extract keywords from file content
            file_keywords = FileProcessor.extract_keywords_from_file_content(file_data['extracted_content'])
            extracted_keywords.extend(file_keywords)
            
            logger.info(f"Extracted {len(file_keywords)} keywords from {file.filename}")
        
    # Combine email body with file contents
    combined_content = body
    if file_contents:
        combined_content += "\n\n--- ATTACHMENT CONTENTS ---\n"
        for file_data in file_contents:
            combined_content += f"\nFile: {file_data['filename']}\n"
            combined_content += f"Type: {file_data['file_type']}\n"
            combined_content += f"Content:\n{file_data['extracted_content']}\n"
            combined_content += "-" * 50 + "\n"
    logger.info(f"Combined content: {combined_content}")

    cohorts = get_cohorts()
    response = get_response(subject, combined_content, list(cohorts.keys()))
    if not response:
        return {"error": "Failed to parse Gemini response."}
    cohort_list = response['cohort']
    abvrs_list = []
    for cohort in cohort_list:
        if cohort not in cohorts:
            return {"error": f"Invalid cohort: {cohort}."}
        abvrs_list.append(cohorts[cohort]['abvrs'])
    abvrs = ",".join(abvrs_list)
    logger.info(f"Response: {response}")
    locations = response['locations']
    logger.info(f"Locations before parsing: {locations}")
    locations, locations_not_found = parse_locations_dict(locations)
    logger.info(f"Locations after parsing: {locations}")
    logger.info(f"Locations not found: {locations_not_found}")
    preset = response['preset']
    creative_size = response['creative_size']
    device_category = response['device_category']
    duration = response['duration']
    target_gender = response['target_gender']
    target_age = response['target_age']
    keywords, auds, left_auds=get_abvrs(subject, body, cohort_list, None)
    return {
        "cohort": cohort_list,
        "locations": locations,
        "locations_not_found": locations_not_found,
        "preset": preset,
        "creative_size": creative_size,
        "device_category": device_category + " Devices",
        "duration": str(duration) + " Days",
        "abvrs": auds,
        "left_abvrs": left_auds,
        "keywords": keywords,
        "target_gender": target_gender,
        "target_age": target_age
    }
    
# def get_abvrs_from_keywords(keywords: List[str]) -> Any:
#     all_audience_data = get_audience_data_from_mysql()
#     if not all_audience_data:
#         print("Error: Could not retrieve audience data from database")
#         exit(1)
#     print(f"Loaded {len(all_audience_data)} audience entries")
    
    
#     cohorts = get_cohorts()
#     response = get_response(keywords, list(cohorts.keys()))
#     if not response:
#         return {"error": "Failed to parse Gemini response."}
#     cohort_list = response['cohort']
#     abvrs_list = []
#     for cohort in cohort_list:
#         if cohort not in cohorts:
#             return {"error": f"Invalid cohort: {cohort}."}
#         abvrs_list.append(cohorts[cohort]['abvrs'])
#     abvrs = ",".join(abvrs_list)
#     print("Response:", response)
#     locations = response['locations']
#     preset = response['preset']
#     creative_size = response['creative_size']
#     device_category = response['device_category']
#     duration = response['duration']
#     keywords, auds, left_auds=get_abvrs(subject, body, [])
#     return {
#         "cohort": cohort_list,
#         "locations": locations,
#         "preset": preset,
#         "creative_size": creative_size,
#         "device_category": device_category + " Devices",
#         "duration": str(duration) + " Days",
#         "abvrs": auds,
#         "left_abvrs": left_auds,
#         "keywords": keywords
#     }
    

    
    

# conda create -n gemini_mediaplan python=3.11.9