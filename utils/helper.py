import requests
import logging
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional, Tuple
from utils.similarity_based_rag import get_location_groups, get_top_k_location_group_matches
import copy

logger = logging.getLogger(__name__)

load_dotenv()

def get_cohorts() -> Dict[str, Dict[str, Any]]:
    """Get list of cohorts from the API"""
    try:
        response = requests.get(f"{os.getenv('PROD_API_URL')}/get-all-mediaplan-cohorts")
        all_cohorts = response.json()
        cohorts = {}
        for cohort in all_cohorts:
            cohort_id = cohort['id']
            cohort_name = cohort['name']
            cohort_abvrs = cohort['abvrs']
            cohorts[cohort_name] = {
                'id': cohort_id,
                'abvrs': cohort_abvrs
            }
        return cohorts
    except Exception as e:
        logger.error(f"Error getting cohorts: {e}", exc_info=True)
        return {}

def get_location_id_for_a_single_location(location: str) -> Optional[Dict[str, Any]]:
    url = f"{os.getenv('LOCATIONS_API_URL')}/locations?name={location}"
    """Get location id for a location"""
    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            required_locations=[item for item in data if item['name']==location]
            if len(required_locations) > 0:
                location_data = required_locations[0]
                name = location_data['name']
                id = location_data['locationId']
                type = location_data['type']
                countryCode = location_data['countryCode']
                modified_name = f"{name},{countryCode},{type}"
                return {"id":id,"name":modified_name}
            else:
                return None
        else:
            logger.error(f"Error getting location id for {location}: {response.status_code} {response.text}", exc_info=True)
            return None
    except Exception as e:
        logger.error(f"Error getting location id for {location}: {e}", exc_info=True)
        return None

def get_forecast(abvr: str, includedLocation: List[Dict[str, Any]], excludedLocation: List[Dict[str, Any]], preset: str, sizes: List[List[int]], devices: List[Dict[str, str]], geoWiseResponse: bool, duration: int, nameAsId: str, scale: float) -> Optional[Dict[str, Any]]:
    """Get forecast data for a cohort and locations"""
    url = f"{os.getenv('PROD_API_URL')}/forecast?geoWiseResponse={geoWiseResponse}"
    payload = {
        "lineItemPriorityValue": 8,
        "creativeSize": sizes,
        "inventoryPresets": preset,
        "deviceCategory": devices,
        "includedLocations": includedLocation,
        "excludedLocations": excludedLocation,
        "abvr": abvr,
        "startDate": (datetime.now()+timedelta(days=1)).strftime("%d-%m-%Y 00:00:00"),
        "endDate": (datetime.now()+timedelta(days=duration)).strftime("%d-%m-%Y 23:59:59")
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    logger.info(f"payload: {payload}")
    response = requests.post(url, json = payload, headers = headers)
    if response.status_code == 200:
        data = response.json()
        if geoWiseResponse:
            for key, value in data.items():
                data[key]["user"] = round(value["user"]*scale, 2)
                data[key]["impr"] = round(min(3*data[key]["user"], value["impr"]*scale), 2)
            return data
        else: 
            userReach = data['CombinedResponse']['user']
            impressions = data['CombinedResponse']['impr']
        return {nameAsId: {"user": round(scale*userReach, 2), "impr": round(min(3*scale*userReach, scale*impressions), 2)}}
    else:
        logger.error(f"Error getting forecast data: {response.status_code} {response.text}", exc_info=True)
        return None

def parse_locations_dict(locations: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Convert a location dictionary to a list of formatted location objects.
    
    Input format example:
    {
        "someName": {
            "includedLocations": ["India,IN,COUNTRY,2356"],
            "excludedLocations": ["Delhi,IN,CITY,23"],
            "nameAsId": ""
        }
    }

    Output:
    [
        {
            "includedLocations": [{"name": "India", "id": 2356}],
            "excludedLocations": [{"name": "Delhi", "id": 23}],
            "nameAsId": "I-D"
        }
    ]
    """
    parsed_locations = []
    locations_not_found=set()
    location_groups=get_location_groups()
    for location in locations:
        if len(location["excludedLocations"])==0 and len(location["includedLocations"])>=1:
            included_locations=[]
            possible_location_groups=[]
            for inc_location in location["includedLocations"]:
                location_id=get_location_id_for_a_single_location(inc_location)
                if location_id:
                    included_locations.append(location_id)
                    parsed_locations.append({
                        "includedLocations": [location_id],
                        "excludedLocations": [],
                        "nameAsId": ""
                    })
                else: 
                    possible_location_groups.append(inc_location)
            logger.info(f"included locations: in case 1: {included_locations}")
            logger.info(f"possible groups locations: in case 1: {possible_location_groups}")
            # get forecast for included locations
            for possible_location in possible_location_groups:
                location_groups_matches = get_top_k_location_group_matches(location_groups, possible_location, k=1)
                logger.info(f"Matches: {location_groups_matches}")
                if len(location_groups_matches)>0 and  location_groups_matches[0][1]>0.75:
                    location_group_details=location_groups_matches[0][0]
                    parsed_locations.append(location_group_details)
                else:
                    logger.info(f"No location or location group matches found for {possible_location}")
                    locations_not_found.add(possible_location)
        elif len(location["includedLocations"])==0 and len(location["excludedLocations"])==0:
            parsed_locations.append({
                "includedLocations": [],
                "excludedLocations": [],
                "nameAsId": "All"
            })
        else:
            included_locations=[]
            excluded_locations=[]
            all_locations_found = True
            logger.info(f"locations in else case: {all_locations_found}")
            for inc_location in location["includedLocations"]:
                loc=get_location_id_for_a_single_location(inc_location)
                if loc:
                    included_locations.append(loc)
                else:
                    all_locations_found = False
                    logger.info(f"Failed to get location id for {inc_location}")
                    break
                        
            for exc_location in location["excludedLocations"]:
                loc=get_location_id_for_a_single_location(exc_location)
                if loc:
                    excluded_locations.append(loc)
                else:
                    all_locations_found = False
                    logger.info(f"Failed to get location id for {exc_location}")
                    break
            logger.info(f"included: {included_locations}: excluded: {excluded_locations}: found: {all_locations_found}")
            if all_locations_found:
                parsed_locations.append({
                    "includedLocations": included_locations,
                    "excludedLocations": excluded_locations,
                    "nameAsId": location["nameAsId"]
                })
            else:
                locations_not_found.add(location)
    final_parsed_locations=[]
    visited_locations=set()
    for location in parsed_locations:
        if location["nameAsId"] and location["nameAsId"] not in visited_locations:
            final_parsed_locations.append(location)
            visited_locations.add(location["nameAsId"])
        elif len(location["includedLocations"])==1 and len(location["excludedLocations"])==0 and location["includedLocations"][0]["name"] not in visited_locations:
            final_parsed_locations.append(location)
            visited_locations.add(location["includedLocations"][0]["name"])
            
    logger.info(f"final_parsed_locations: {final_parsed_locations}")
    logger.info(f"locations_not_found: {locations_not_found}")
    return final_parsed_locations, list(locations_not_found)

def simplify_locations(locations):
    simplified = []
    merged_included = []
    overall_found = False
    for loc in locations:
        included = loc.get("includedLocations", [])
        excluded = loc.get("excludedLocations", [])

        # Merge condition: single included location, no excluded
        if len(included) == 1 and not excluded:
            merged_included.append(included[0])
        elif len(included) == 0 and len(excluded) == 0:
            overall_found = True
        else:
            simplified.append(loc)

    print(f"simplified: {simplified} merged_included: {merged_included} overall_found: {overall_found}")
    return simplified,merged_included, overall_found

def get_age_scale(age: str) -> float:
    age_scale_dict = {
        "18-24": 0.15,
        "25-34": 0.35,
        "35-44": 0.3,
        "45-54": 0.1,
        "55+": 0.1,
        "All": 1.0
    }

    bucket_ranges = {
        "18-24": (18, 24),
        "25-34": (25, 34),
        "35-44": (35, 44),
        "45-54": (45, 54),
        "55+": (55, 100),
    }
    if age == "All":
        return 1.0
    if age in age_scale_dict:
        return age_scale_dict[age]

    # Open-ended like "18+"
    if age.endswith("+"):
        start = int(age[:-1])
        end = 100
    # Ranges like "18-32"
    elif "-" in age:
        start, end = map(int, age.split("-"))
    else:
        return 0.0  # fallback

    total_scale = 0.0

    for bucket, (b_start, b_end) in bucket_ranges.items():
        # find overlap
        overlap_start = max(start, b_start)
        overlap_end = min(end, b_end)
        if overlap_start <= overlap_end:
            overlap_years = overlap_end - overlap_start + 1
            bucket_years = b_end - b_start + 1
            weight = age_scale_dict[bucket]
            # prorate contribution
            total_scale += weight * (overlap_years / bucket_years)

    return round(total_scale, 3)

def get_forecast_data(audience_segment: str, locations: List[Dict[str, Any]], presets: List[str], creative_size: str, device_category: str, duration: int, gender: str, age: str) -> Dict[str, Any]:
    """Get forecast data for a cohort and locations"""
    creative_size_dict={
        "Banners": [[300, 200],[728, 90],[300, 600],[320, 50],[120, 600]],
        "Interstitial": [[304, 350],[320, 480],[1320, 600],[728, 500],[1320, 570],[1260, 570],[360, 480],[1, 1],[300, 250],[480, 320],[768, 1024]],
        "Skinning": [[125, 600],[160, 600]],
        "Top Banner": [[1, 1],[120, 600],[320, 100]]
    }
    device_category_dict={
        "Mobile": [{"name": "Feature Phone","id": "30003"},{"name": "Smartphone","id": "30001"},{"name": "Tablet","id": "30002"}],
        "Desktop": [{"name": "Connected TV","id": "30004"},{"name": "Desktop","id": "30000"}],
        "All": [{"name": "Feature Phone","id": "30003"},{"name": "Smartphone","id": "30001"},{"name": "Tablet","id": "30002"},{"name": "Connected TV","id": "30004"},{"name": "Desktop","id": "30000"}]
    }
    preset_display_text={
        "TIL_All_Cluster_RNF":"TIL",
        "TIL_TOI_Only_RNF":"TOI",
        "TIL_ET_Only_RNF":"ET",
        "TIL_ET_And_TOI_RNF":"TOI+ET",
        "TIL_NBT_Only_RNF":"NBT",
        "TIL_MT_Only_RNF":"Maharashtra Times",
        "TIL_VK_Only_RNF":"Vijay Karnataka",
        "TIL_IAG_Only_RNF":"IAG",
        "TIL_EIS_Only_RNF":"EI Samay",
        "TIL_Tamil_Only_RNF":"Tamil",
        "TIL_Telugu_Only_RNF":"Telugu",
        "TIL_Malayalam_Only_RNF":"Malayalam",
        "TIL_All_Languages_RNF":"All Languages"
    }
    gender_scale_dict={
        "All": 1,
        "Male": 0.7,
        "Female": 0.3
    }
    scale = 1.0
    if gender in gender_scale_dict.keys():
        scale*=gender_scale_dict[gender]
    
    age_scale=get_age_scale(age)
    scale*=age_scale
    logger.info(f"scale: {scale}")
    devices= device_category_dict[device_category]
    size= creative_size_dict[creative_size]
    abvrs=audience_segment
    result={}
    simplified_locations,merged_included_locations, overall_found =simplify_locations(locations)
    for preset in presets:
        overall_included = set()
        overall_excluded = set()
        overall = []
        final_response={}
        for location in simplified_locations:
            forecast = get_forecast(abvrs, location["includedLocations"], location["excludedLocations"], preset, size, devices, False, duration, location["nameAsId"], scale)
            logger.info(f"forecast for {location}: {forecast}")
            if forecast:
                final_response={**final_response, **forecast}
                overall.append(location)
            else:
                logger.info(f"Failed to get forecast for {location}")
        forecast = get_forecast(abvrs, merged_included_locations, [], preset, size, devices, True, duration, "All", scale)
        logger.info(f"forecast for All: {forecast}")
        if forecast:
            final_response={**final_response, **forecast}
            overall.append({"includedLocations": merged_included_locations, "excludedLocations": [], "nameAsId": "All"})
        else:
            logger.info(f"Failed to get forecast for All")
            
        logger.info(f"final_response before overall: {final_response}")
        if len(final_response) == 1:
            only_value = next(iter(final_response.values()))
            logger.info(f"only_value: {only_value}: copied: {copy.deepcopy(only_value)}")
            final_response["Overall"] = copy.deepcopy(only_value)
        else:
            if overall_found:
                overall_included = set()
                overall_excluded = set()
            else:
                for loc in overall:
                    for inc in loc.get("includedLocations", []):
                        overall_included.add(inc["id"])
                    for exc in loc.get("excludedLocations", []):
                        overall_excluded.add(exc["id"])
            logger.info(f"overall_included: {overall_included}")
            logger.info(f"overall_excluded: {overall_excluded}")
            logger.info(f"overall: {overall}")
            overall_forecast = get_forecast(abvrs, [{"id": id, "name": ""} for id in overall_included], [{"id": id, "name": ""} for id in overall_excluded], preset, size, devices, False, duration, "Overall", scale)
            if overall_forecast:
                final_response={**final_response, **overall_forecast}
        result[preset_display_text[preset]]=final_response
    logger.info(f"final_response: {result}")
    return result
    