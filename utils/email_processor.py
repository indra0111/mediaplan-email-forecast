import openai
import os
import json
from dotenv import load_dotenv
from utils.helper import get_cohorts, parse_locations_dict
from utils.audience_selector import get_relevant_keywords, get_filtered_audience_data, check_cache_validity, find_relevant_entries, get_all_audience_info_cached, get_cohort_ppt_links
from utils.file_processor import FileProcessor
import logging
from typing import Any, List
from fastapi import UploadFile
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configure Azure OpenAI
openai.api_type = "azure"
openai.azure_endpoint = os.getenv('AZURE_API_BASE')
openai.api_key = os.getenv('AZURE_API_KEY')
openai.api_version = os.getenv('AZURE_API_VERSION', '2024-02-15-preview')

# Initialize Azure OpenAI model
model_name = os.getenv('AZURE_OPENAI_MODEL_NAME', 'gpt-4o-mini')


def get_response(subject, body, cohorts):
    prompt = f"""
    You are an AI assistant specialized in analyzing email requests for digital advertising campaigns. Your task is to extract campaign parameters from email content and classify them into appropriate advertising categories.

    **CONTEXT:** You're helping media planners classify email requests for digital ad campaigns on Times Internet Limited (TIL) platforms.

    **EMAIL CONTENT:**
    Subject: {subject}
    Body: {body}

    **Available Cohorts:**
    {cohorts}  
    
    **Rules:**
    - Select only from the above list. Do not invent names.
    - If no relevant cohort exists → return empty array `[]`
    - Return as array: `["cohort1", "cohort2"]`

    **Available Creative Sizes:** ["Banners", "Interstitial", "Skinning", "Top Banner"]
    - Default: `"Banners"` if not specified

    **Available Presets:**
    ["TIL_All_Cluster_RNF", "TIL_TOI_Only_RNF", "TIL_ET_Only_RNF", "TIL_ET_And_TOI_RNF",
    "TIL_NBT_Only_RNF", "TIL_MT_Only_RNF", "TIL_VK_Only_RNF", "TIL_IAG_Only_RNF",
    "TIL_EIS_Only_RNF", "TIL_Tamil_Only_RNF", "TIL_Telugu_Only_RNF",
    "TIL_Malayalam_Only_RNF", "TIL_All_Languages_RNF"]  

    **Preset Rules:**
    - "TIL_All_Cluster_RNF" → default
    - "TIL_TOI_Only_RNF" → if "Times of India" mentioned
    - "TIL_ET_Only_RNF" → if "Economic Times" mentioned
    - "TIL_ET_And_TOI_RNF" → if TOI+ET or ET+TOI or ET and TOI mentioned
    - "TIL_NBT_Only_RNF" → if "Navbharat Times" or "Hindi" mentioned
    - "TIL_MT_Only_RNF" → if "Maharashtra Times" or "Marathi" mentioned
    - "TIL_VK_Only_RNF" → if "Vijay Karnataka" or "Kannada" mentioned
    - "TIL_IAG_Only_RNF" → if "I Am Gujarat" or "Gujarati" mentioned
    - "TIL_EIS_Only_RNF" → if "Ei Samay" mentioned
    - "TIL_Tamil_Only_RNF" → if "Tamil" mentioned
    - "TIL_Telugu_Only_RNF" → if "Telugu" mentioned
    - "TIL_Malayalam_Only_RNF" → if "Malayalam" mentioned
    - "TIL_All_Languages_RNF" → if "All Languages" or "Regional Languages" mentioned

    **Demographics:**
    - Target Age: must be returned as a single string (not an array).  
    - The LLM must infer or directly extract the most relevant age bracket from the email content.  
    - Valid formats:
    - **Fixed range** → "X-Y" (e.g., "18-24", "25-34", "35-44", "45-54", "18-55", "20-30", "22-45")  
        - If the email explicitly mentions a range (e.g., "20-30"), **use that exact range** without rounding or mapping to predefined brackets.
    - **Open-ended lower bound** → "X+" (e.g., "18+", "20+", "55+")  
    - **Catch-all** → "All" (if unclear, unspecified, or broad targeting)  
    - Examples:
    - "college students", "youth", "Gen Z", "teenagers" → `"18-24"`
    - "young professionals", "millennials", "working professionals" → `"25-34"`
    - "middle-aged", "parents", "decision makers" → `"35-44"` or `"45-54"`
    - "senior citizens", "retired", "elderly" → `"55+"`
    - "broad targeting", "general audience", "across all age groups" → `"All"`

    - Target Genders: ["Male", "Female", "All"]
    - Gender Inference Examples:
        - "women", "female", "moms", "ladies" → "Female"
        - "men", "male", "gentlemen" → "Male"
        - If gender-neutral or not specified → "All"

    **Device & Duration:**
    - Device: "Mobile", "Desktop", or "All" (default: "All")
        - "Mobile" → if only mobile devices mentioned
        - "Desktop" → if only desktop/computer mentioned
        - "All" → if multiple devices mentioned or unspecified (DEFAULT)
    - Duration: extract days as integer (default: 30)

    **OUTPUT FORMAT:**
    Return ONLY valid JSON with no additional text or explanations:
    ```json
    {{
        "cohort": ["cohort1", "cohort2"],
        "preset": ["TIL_All_Cluster_RNF"],
        "creative_size": "Banners",
        "device_category": "All",
        "target_gender": "All",
        "target_age": "All",
        "duration": 30
    }}
    
    **Field Types:**
    - Arrays: `cohort`, `preset`, `target_age`
    - Strings: `creative_size`, `device_category`, `target_gender`
    - Integer: `duration`
    """
    # Generate response using Azure OpenAI
    try:
        response = openai.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are an intelligent assistant designed to classify email requests into relevant ad cohorts, locations, presets, and creative formats. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=2000
        )
        cleaned_text = response.choices[0].message.content.replace('```json', '').replace('```', '').strip()
        # Parse the response text into JSON
        try:
            response_json = json.loads(cleaned_text)
            return response_json
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON response: {e}")
            return None
    except Exception as e:
        logger.error(f"Error calling Azure OpenAI: {e}")
        return None

def get_filtered_audience_names_from_llm(keywords, audience_names):
    audience_list_str = "\n".join([f"- {name}" for name in audience_names])
    prompt = f"""
    You are an audience targeting specialist for digital advertising campaigns. Your task is to select the most relevant audience segments based on campaign requirements.

        🎯 **User Intent**
        "{keywords}"

    **AVAILABLE AUDIENCE SEGMENTS:**
    {audience_list_str}

    **SELECTION CRITERIA:**
    1. **Relevance First** – Select only audiences that directly and strongly match the campaign's target profile.
    2. **Precision Over Quantity** – Do not include audiences that are only loosely or partially relevant.
    3. **Behavioral Match** – Consider audience's online behavior, interests, and demographics.
    4. **Campaign Fit** – Must align with the campaign's stated goals.

    **SELECTION RULES:**
    - **Exact Match Only:** Use audience names exactly as shown in the provided list (identical spelling, capitalization, and punctuation).
    - **No Creation:** Do not invent, modify, or combine audience names.
    - **Ranking:** Order audiences from most relevant to least relevant.
    - **No Upper Limit:** If many audiences are equally relevant, include them all.
    - **Empty Output:** If no relevant audiences are found, return an empty array.
    - **No Duplicates:** Each audience can appear only once.

    **OUTPUT FORMAT:**
    Return ONLY valid JSON with no additional text:
    ```json
    {{
        "audiences": [
            "most_relevant_audience",
            "second_most_relevant_audience",
            "third_most_relevant_audience"
        ]
    }}
    ```

    **IMPORTANT:**
    - Return valid JSON only
    - Include only the most relevant audiences
    - Ensure all audience names exactly match the provided list
    """
    # Generate response using Azure OpenAI
    try:
        response = openai.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are an intelligent assistant designed to select the most relevant audience names from a list. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=1000
        )
        cleaned_text = response.choices[0].message.content.replace('```json', '').replace('```', '').strip()
        # Parse the response text into JSON
        try:
            response_json = json.loads(cleaned_text)
            logger.info(f"Response JSON: {response_json}")
            return response_json['audiences']
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON response: {e}")
            return None
    except Exception as e:
        logger.error(f"Error calling Azure OpenAI: {e}")
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
    cohort_audience_data = get_filtered_audience_data(cohorts)
    all_audience_data = get_all_audience_info_cached()
    cohort_abvrs = [cohort['abvr'] for cohort in cohort_audience_data]
    all_audience_data = [audience for audience in all_audience_data if audience['abvr'] not in cohort_abvrs]
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
    sorted_cohort_entries = find_relevant_entries(keywords_array, [item for sublist in cohort_audience_data.values() for item in sublist])
    final_cohort_sorted_entries = {}
    for cohort in cohort_audience_data:
        abvrs = [entry['abvr'] for entry in cohort_audience_data[cohort]]
        final_cohort_sorted_entries[cohort] = [entry for entry in sorted_cohort_entries if entry['abvr'] in abvrs]
        final_cohort_sorted_entries[cohort] = sorted(final_cohort_sorted_entries[cohort], key=lambda x: x['similarity'], reverse=True)
    
    logger.info(f"Results: {len(results)}")
    if not results:
        logger.info("Warning: No relevant entries found")
    else:
        selected_audiences, left_audiences = process_top_k_selected_audiences(results, keywords_array)
        return keywords_array, final_cohort_sorted_entries, selected_audiences, left_audiences
    
    return None, None, None, None

def update_audiences_using_added_cohort(cohorts=[], keywords_array=None):
    cohort_audience_data = get_filtered_audience_data(cohorts)

    # Find relevant entries (will use cache if available)
    logger.info(f"\nFinding relevant entries...")
    sorted_cohort_entries = find_relevant_entries(keywords_array, [v for values in cohort_audience_data.values() for v in values])
    final_cohort_sorted_entries = {}
    for cohort in cohort_audience_data:
        abvrs = [entry['abvr'] for entry in cohort_audience_data[cohort]]
        final_cohort_sorted_entries[cohort] = [entry for entry in sorted_cohort_entries if entry['abvr'] in abvrs]
        final_cohort_sorted_entries[cohort] = sorted(final_cohort_sorted_entries[cohort], key=lambda x: x['similarity'], reverse=True)
    logger.info(f"Results: {len(final_cohort_sorted_entries)}")
    cohort_ppts_list = get_cohort_ppt_links(cohorts)
    return final_cohort_sorted_entries, cohort_ppts_list

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
        return {"error": "Failed to parse OpenAI response."}
    
    # Get locations separately
    location_response = get_location_response(subject, combined_content)
    logger.info(f"Location response: {location_response}")
    cohort_list = response['cohort']
    valid_cohort_list = []
    for cohort in cohort_list:
        if cohort not in cohorts:
            continue
        valid_cohort_list.append(cohort)
    cohort_ppts_list = get_cohort_ppt_links(valid_cohort_list)
    logger.info(f"Response: {response}")
    locations, locations_not_found = parse_locations_dict(location_response)
    logger.info(f"Locations after parsing: {locations}")
    logger.info(f"Locations not found: {locations_not_found}")
    preset = response['preset']
    creative_size = response['creative_size']
    device_category = response['device_category']
    duration = response['duration']
    target_gender = response['target_gender']
    target_age = response['target_age']
    keywords, sorted_cohort_entries, auds, left_auds=get_abvrs(subject, body, valid_cohort_list, None)
    return {
        "cohort": valid_cohort_list,
        "locations": locations,  # Use separately extracted locations
        "locations_not_found": locations_not_found,  # You can add logic to check against known locations
        "preset": preset,
        "creative_size": creative_size,
        "device_category": device_category + " Devices",
        "duration": str(duration) + " Days",
        "cohort_auds": sorted_cohort_entries,
        "cohort_ppts": cohort_ppts_list,
        "abvrs": auds,
        "left_abvrs": left_auds,
        "keywords": keywords,
        "target_gender": target_gender if target_gender else "All",
        "target_age": target_age if target_age else "All"
    }
    
def get_location_response(subject: str, body: str) -> dict:
    """Extract location information using a focused prompt"""
    location_prompt = f"""
    You are a location extraction specialist for digital advertising campaigns in India. Your task is to identify and structure location targeting information from email content.

    **CONTEXT:** You're analyzing email requests for ad campaigns that may include geographic targeting across both Indian and international locations (countries, states, cities, or regions).

    **Email Content:**
    Subject: {subject}
    Body: {body}

    **LOCATION EXTRACTION RULES:**

    1. **DETECTION:** Identify all geographic mentions (Indian or international). If no geographic term is mentioned → return empty array `[]`

    2. **ABBREVIATION EXPANSION:** Always expand state abbreviations to full names:
       - "MH" → "Maharashtra", "KA" → "Karnataka", "TN" → "Tamil Nadu"
       - "UP" → "Uttar Pradesh", "AP" → "Andhra Pradesh", "MP" → "Madhya Pradesh"
       - "DL" → "Delhi", "HR" → "Haryana", "PB" → "Punjab"

    3. **LOCATION STRUCTURE:** Each location gets its own dictionary object:
       - `"includedLocations"`: Array of locations to target
       - `"excludedLocations"`: Array of locations to exclude (can be empty)
       - `"nameAsId"`: Unique identifier (required if multiple included locations OR any exclusions)

    4. **SEPARATION RULES:**
       - Each state/region is separate unless explicitly combined
       - "Delhi NCR" → single location (combined area)
       - "Tier 1 Cities" → single location (category)
       - "UP, Haryana" → two separate location objects
       - "Maharashtra excluding Mumbai" → one location with exclusions

    **EXAMPLES:**

    **Example 1 - Single State:**
    Email mentions: "Target Maharashtra"
    ```json
    {{
        "locations": [
            {{
                "includedLocations": ["Maharashtra"],
                "excludedLocations": [],
                "nameAsId": ""
            }}
        ]
    }}
    ```

    **Example 2 - Multiple States:**
    Email mentions: "Target Karnataka and Tamil Nadu"
    ```json
    {{
        "locations": [
            {{
                "includedLocations": ["Karnataka"],
                "excludedLocations": [],
                "nameAsId": ""
            }},
            {{
                "includedLocations": ["Tamil Nadu"],
                "excludedLocations": [],
                "nameAsId": ""
            }}
        ]
    }}
    ```

    **Example 3 - State with Exclusions:**
    Email mentions: "Target Maharashtra excluding Mumbai"
    ```json
    {{
        "locations": [
            {{
                "includedLocations": ["Maharashtra"],
                "excludedLocations": ["Mumbai"],
                "nameAsId": "maharashtra_excluding_mumbai"
            }}
        ]
    }}
    ```

    **Example 4 - Regional Targeting:**
    Email mentions: "Target South India"
    ```json
    {{
        "locations": [
            {{
                "includedLocations": ["South India"],
                "excludedLocations": [],
                "nameAsId": ""
            }}
        ]
    }}
    ```

    **OUTPUT FORMAT:**
    Return ONLY valid JSON with the structure shown above. No additional text or explanations.
    """
    
    try:
        response = openai.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are a location extraction specialist. Always respond with valid JSON only."},
                {"role": "user", "content": location_prompt}
            ],
            temperature=0.1,
            max_tokens=1000
        )
        
        cleaned_text = response.choices[0].message.content.replace('```json', '').replace('```', '').strip()
        try:
            response_json = json.loads(cleaned_text)
            return response_json.get('locations', [])
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing location JSON response: {e}")
            return []
    except Exception as e:
        logger.error(f"Error calling Azure OpenAI for location: {e}")
        return []
    

    
    

# conda create -n gemini_mediaplan python=3.11.9