import requests
import logging
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional, Tuple
from utils.similarity_based_rag import get_location_groups, get_top_k_location_group_matches

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
    url = f"{os.getenv('LOCATIONS_API_URL')}/locations/search/{location}"
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

def get_forecast(abvr: str, includedLocation: List[Dict[str, Any]], excludedLocation: List[Dict[str, Any]], preset: str, sizes: List[List[int]], devices: List[Dict[str, str]], geoWiseResponse: bool, duration: int, nameAsId: str) -> Optional[Dict[str, Any]]:
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
            return data
        else: 
            userReach = data['CombinedResponse']['user']
            impressions = data['CombinedResponse']['impr']
        return {nameAsId: {"user": userReach, "impr": impressions}}
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
    locations_not_found=[]
    location_groups=get_location_groups()
    logger.info(f"location_groups: {location_groups}")
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
                    loation_group_name=location_groups_matches[0][0]
                    location_group_ids=location_groups_matches[0][2]
                    parsed_locations.append({
                        "includedLocations": location_group_ids,
                        "excludedLocations": [],
                        "nameAsId": loation_group_name
                    })
                else:
                    logger.info(f"No location or location group matches found for {possible_location}")
                    locations_not_found.append(possible_location)
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
                locations_not_found.append(location)
    return parsed_locations,locations_not_found

def simplify_locations(locations):
    simplified = []
    merged_included = []

    for loc in locations:
        included = loc.get("includedLocations", [])
        excluded = loc.get("excludedLocations", [])

        # Merge condition: single included location, no excluded
        if len(included) == 1 and not excluded:
            merged_included.append(included[0])
        else:
            simplified.append(loc)

    return simplified,merged_included

def get_forecast_data(audience_segment: str, locations: List[Dict[str, Any]], presets: List[str], creative_size: str, device_category: str, duration: int) -> Dict[str, Any]:
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
    devices= device_category_dict[device_category]
    size= creative_size_dict[creative_size]
    abvrs=audience_segment
    final_response={}
    result={}
    simplified_locations,merged_included_locations=simplify_locations(locations)
    logger.info(f"simplified_locations: {simplified_locations}")
    logger.info(f"merged_included_locations: {merged_included_locations}")
    for preset in presets:
        for location in simplified_locations:
            forecast = get_forecast(abvrs, location["includedLocations"], location["excludedLocations"], preset, size, devices, False, duration, location["nameAsId"])
            if forecast:
                final_response={**final_response, **forecast}
            else:
                logger.info(f"Failed to get forecast for {location}")
        forecast = get_forecast(abvrs, merged_included_locations, [], preset, size, devices, True, duration, "All")
        if forecast:
            final_response={**final_response, **forecast}
        else:
            logger.info(f"Failed to get forecast for All")
            
        result[preset_display_text[preset]]=final_response
    logger.info(f"final_response: {result}")
    return result
    