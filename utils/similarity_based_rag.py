from sentence_transformers import SentenceTransformer, util
import requests
import os
model = SentenceTransformer("all-MiniLM-L6-v2")

def get_top_k_location_group_matches(location_groups_details, query, k=5):
    location_embeddings={
        key: model.encode(key, convert_to_tensor=True)
        for key in location_groups_details.keys()
    }
    query_embedding = model.encode(query, convert_to_tensor=True)
    scores = [
        (name, float(util.pytorch_cos_sim(query_embedding, emb)))
        for name, emb in location_embeddings.items()
    ]
    top_k = sorted(scores, key=lambda x: x[1], reverse=True)
    top_k = top_k[:k]
    return [[location_groups_details[name], score] for name, score in top_k]

def get_location_groups():
    location_groups = {}
    url = f"{os.getenv('LOCATIONS_API_URL')}/location-groups"
    response = requests.get(url)
    location_groups = response.json()
    location_groups_details = {}
    for group in location_groups.keys():
        included_locations = location_groups[group]["includedLocations"]
        excluded_locations = location_groups[group]["excludedLocations"]
        included_locations_details = [{
            "id": location["locationId"],
            "name": f"{location['name']},{location['countryCode']},{location['type']}"
        } for location in included_locations]
        excluded_locations_details = [{
            "id": location["locationId"],
            "name": f"{location['name']},{location['countryCode']},{location['type']}"
        } for location in excluded_locations]
        location_groups_details[group] = {
            "includedLocations": included_locations_details,
            "excludedLocations": excluded_locations_details,
            "nameAsId": group
        }
    return location_groups_details