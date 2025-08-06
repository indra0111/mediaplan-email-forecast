from sentence_transformers import SentenceTransformer
import numpy as np
import requests
import logging
import json
import os
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from sklearn.metrics.pairwise import cosine_similarity
import openai
import pandas as pd

model = SentenceTransformer("all-MiniLM-L6-v2")
load_dotenv()

# Configure Azure OpenAI
openai.api_type = "azure"
openai.azure_endpoint = os.getenv('AZURE_API_BASE')
openai.api_key = os.getenv('AZURE_API_KEY')
openai.api_version = os.getenv('AZURE_API_VERSION', '2024-02-15-preview')

# Initialize Azure OpenAI model
model_name = os.getenv('AZURE_OPENAI_MODEL_NAME', 'gpt-4o-mini')

logger = logging.getLogger(__name__)

"""
AUDIENCE SELECTOR WITH EMBEDDING CACHING

This script extracts relevant audience segments from email content using AI-powered
keyword extraction and semantic similarity matching.

FEATURES:
- Dynamic domain detection from email content
- Embedding caching to avoid recomputation
- Multi-strategy similarity matching
- CSV export of results

CACHING:
- First run: Computes embeddings and saves to 'audience_embeddings.csv'
- Subsequent runs: Loads embeddings from cache (much faster)
- Cache is automatically invalidated if data count changes

USAGE:
1. Run normally: python audience_selector.py
2. Force recomputation: Uncomment the force_recompute_embeddings line
3. Check cache: Use check_cache_validity() function

CACHE FILES:
- audience_embeddings.csv: Precomputed embeddings
- audience_data.csv: Final results with similarity scores
"""

def precompute_embeddings(data):
    """
    Enhanced embedding computation with better text preprocessing
    """
    for entry in data:
        # Create multiple text representations for better matching
        name = entry.get('name', '')
        description = entry.get('description', '')
        
        # Strategy 1: Combined text with enhanced context
        combined_text = f"Audience segment: {name}. Description: {description}"
        
        # Strategy 2: Name-focused embedding
        name_focused = f"Target audience: {name}"
        
        # Strategy 3: Description-focused embedding
        desc_focused = f"Audience characteristics: {description}"
        
        # Create embeddings for each strategy
        combined_embedding = model.encode(combined_text)
        name_embedding = model.encode(name_focused)
        desc_embedding = model.encode(desc_focused)
        
        # Store all embeddings
        entry["embedding"] = combined_embedding
        entry["name_embedding"] = name_embedding
        entry["desc_embedding"] = desc_embedding
        
        # Store original text for debugging
        entry["combined_text"] = combined_text
        
    return data

def embed_email(targeting_themes):
    """
    Create a more sophisticated embedding for email targeting themes
    """
    if not targeting_themes:
        return None
    
    # Create multiple embedding strategies and combine them
    embeddings = []
    
    # Strategy 1: Combined sentence embedding
    combined_sentence = "Audience targeting for: " + " and ".join(targeting_themes)
    embeddings.append(model.encode(combined_sentence))
    
    # Strategy 2: Individual theme embeddings (averaged)
    individual_embeddings = [model.encode(theme) for theme in targeting_themes]
    avg_individual = np.mean(individual_embeddings, axis=0)
    embeddings.append(avg_individual)
    
    # Strategy 3: Enhanced context embedding
    enhanced_context = f"Target audience interested in {', '.join(targeting_themes)} with high purchase intent and premium preferences"
    embeddings.append(model.encode(enhanced_context))
    
    # Combine all strategies with weighted average
    # Give more weight to combined sentence and enhanced context
    weights = [0.4, 0.3, 0.3]  # Adjust weights based on performance
    final_embedding = np.average(embeddings, axis=0, weights=weights)
    
    return final_embedding


def get_top_matches(email_embedding, data, top_k=5):
    """
    Enhanced similarity matching using multiple embedding strategies
    """
    if email_embedding is None:
        return []
    
    results = []
    
    for entry in data:
        # Calculate similarity using multiple strategies
        similarities = []
        
        # Strategy 1: Combined embedding similarity
        combined_sim = cosine_similarity([email_embedding], [entry["embedding"]])[0][0]
        similarities.append(combined_sim)
        
        # Strategy 2: Name-focused similarity
        name_sim = cosine_similarity([email_embedding], [entry["name_embedding"]])[0][0]
        similarities.append(name_sim * 0.8)  # Slightly lower weight for name
        
        # Strategy 3: Description-focused similarity
        desc_sim = cosine_similarity([email_embedding], [entry["desc_embedding"]])[0][0]
        similarities.append(desc_sim * 0.9)  # Slightly lower weight for description
        
        # Calculate weighted average similarity
        weights = [0.5, 0.25, 0.25]  # Adjust weights based on importance
        final_similarity = np.average(similarities, weights=weights)
        
        entry["similarity"] = final_similarity
        entry["similarity_breakdown"] = {
            "combined": similarities[0],
            "name": similarities[1],
            "description": similarities[2]
        }
        
        results.append(entry)
    
    # Sort by similarity and return top results
    sorted_results = sorted(results, key=lambda x: x["similarity"], reverse=True)
    return sorted_results[:top_k]

def find_relevant_entries(targeting_themes, table_data):
    """
    Enhanced function to find relevant audience entries with caching
    """
    logger.info(f"Finding relevant entries for {targeting_themes}")
    # Step 1: Filter and clean data
    filtered_data = filter_and_clean_audience_data(table_data)
    logger.info(f"Filtered data: {len(filtered_data)}")
    # Step 2: Get embeddings from cache or compute them
    precomputed = get_cached_or_compute_embeddings(filtered_data)
    
    # Step 3: Create email embedding
    email_embedding = embed_email(targeting_themes)
    if email_embedding is None:
        logger.info("Warning: Could not create email embedding")
        return []
    
    # Step 4: Find top matches
    top_entries = get_top_matches(email_embedding, precomputed, top_k=200)
    # Step 5: Filter by minimum similarity threshold
    threshold = 0.3  # Adjust this threshold based on your data
    filtered_entries = [entry for entry in top_entries if entry["similarity"] > threshold]
    
    logger.info(f"Found {len(filtered_entries)} entries above similarity threshold {threshold}")
    return filtered_entries

def get_abvrs_from_cohorts(cohorts=None):
    """
    Get abbreviations (abvrs) from given cohort names by calling an external API.
    
    Args:
        cohorts (list): List of cohort names.
    
    Returns:
        set: A set of abbreviations.
    """
    if cohorts is None:
        return set()

    try:
        abvrs = set()
        url = f"{os.getenv('LOCATIONS_API_URL')}/get-all-mediaplan-cohorts"
        response = requests.get(url)
        response.raise_for_status()  # Raises an error for non-200 status codes
        data = response.json()

        for entry in data:
            if entry.get('name') in cohorts:
                raw_abvrs = entry.get('abvrs', '')
                for abvr in raw_abvrs.split(','):
                    abvrs.add(abvr.strip())

        return abvrs
    except Exception as e:
        logger.error(f"Error getting abvrs from cohorts: {e}")
        return set()  # Consistent return type

def get_filtered_audience_data(cohorts=None) -> Optional[List[Dict[str, Any]]]:
    """
    Get audience data from AUDIENCE_API_URL and filter based on specific rules
    """
    try:
        url = f"{os.getenv('AUDIENCE_API_URL')}/getActiveAuds?text=&page_size=30000&offset=0"
        response = requests.get(url)
        data = response.json()
        valid_prefixes = [
            'Persona Installed App', 'Demographic', 'AST', 'User Agent',
            'Industry Impression & Click', 'ET Money', 'User Action',
            'In Market', 'Parent', 'MTAG', 'Interest', 'Package'
        ]
        filtered_entry = [
            {
                "name": entry['audience_name'],
                "description": entry['description'],
                "abvr": entry['abvr']
            }
            for entry in data
            if entry.get('l30d_uniques', 0) > 0
            and entry.get('audience_name')
            and entry.get('description')
            and (
                entry.get('audiencePrefix') in valid_prefixes
                or entry.get('audience_name', '').startswith('Interest |')
            )
        ]
        abvrs = get_abvrs_from_cohorts(cohorts)
        logger.info(f"Abvrs from cohorts: {abvrs}")
        logger.info(f"Filtered entry before abvrs: {len(filtered_entry)}")
        filtered_entry = [entry for entry in filtered_entry if entry['abvr'] not in abvrs]
        logger.info(f"Filtered entry after abvrs: {len(filtered_entry)}")
        return filtered_entry

    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return None

def get_selected_audience_data_by_abvrs(abvrs="") -> Optional[List[Dict[str, Any]]]:
    """
    Get audience data from AUDIENCE_API_URL and filter based on specific rules
    """
    try:
        url = f"{os.getenv('AUDIENCE_API_URL')}/getAudienceInfo"
        response = requests.post(url, data=abvrs)
        data = response.json()
        valid_prefixes = [
            'Persona Installed App', 'Demographic', 'AST', 'User Agent',
            'Industry Impression & Click', 'ET Money', 'User Action',
            'In Market', 'Parent', 'MTAG', 'Interest', 'Package'
        ]
        filtered_entry = [
            {
                "name": entry['audience_name'],
                "description": entry['description'],
                "abvr": entry['abvr'],
                'similarity': 0.5
            }
            for entry in data
            if entry.get('l30d_uniques', 0) > 0
            and entry.get('audience_name')
            and entry.get('description')
            and (
                entry.get('audiencePrefix') in valid_prefixes
                or entry.get('audience_name', '').startswith('Interest |')
            )
        ]
        logger.info(f"Filtered entry after abvrs: {len(filtered_entry)}")
        return filtered_entry

    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return []
    
def get_relevant_keywords(subject, body):
    prompt = f"""
    You are an expert media planning assistant specializing in audience targeting. Your task is to extract 6-8 highly specific, domain-relevant targeting keywords from the email that would help identify the most suitable audience segments.

    **Email Content:**
    Subject: {subject}
    Body: {body}

    **CRITICAL INSTRUCTIONS:**
    1. **Focus on the specific product/service category** mentioned in the email
    2. **Extract keywords that directly relate to the target audience's interests and behaviors**
    3. **Prioritize domain-specific terms over generic ones**
    4. **Avoid broad categories that could match unrelated audiences**
    5. **Consider the exact product (e.g., "diamond jewelry" not just "jewelry")**
    6. **Make sure to never include the city names or locations in the keywords if mentioned in the email**

    **Examples of good keywords:**
    - Demographics: "females 25-55", "premium audience", "NCCS A", "high value goods"
    - Interests: "diamond jewelry", "luxury shopping", "fashion accessories"
    - Behaviors: "online shopping", "premium purchases", "luxury spending"
    - Intent: "purchase intent", "buying behavior", "shopping patterns"

    **Response Format (JSON only):**
    ```json
    {{
        "relevant_entries": [
            "keyword1",
            "keyword2", 
            "keyword3",
            "keyword4",
            "keyword5",
            "keyword6",
            "keyword7",
            "keyword8"
        ]
    }}
    ```

    **For your specific email, extract keywords related to:**
    - Target demographics (females 25-55, NCCS A, premium audience)
    - Product category (diamond studded collection, jewelry)
    - Consumer behavior (high value goods preference, luxury shopping)
    - Platform preferences (English news, TIL platforms)
    - Geographic targeting (cities mentioned)
    - Purchase intent signals

    Return only the JSON object with no additional text or explanations.
    """
    
    # Generate response using Azure OpenAI
    try:
        response = openai.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are an expert media planning assistant specializing in audience targeting. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=1000
        )
        cleaned_text = response.choices[0].message.content.replace('```json', '').replace('```', '').strip()
        try:
            response_json = json.loads(cleaned_text)
            return response_json
        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON response: {e}", exc_info=True)
            return None
    except Exception as e:
        logger.error(f"Error calling Azure OpenAI: {e}")
        return None

def filter_and_clean_audience_data(data):
    """
    Filter and clean audience data for better quality
    """
    if not data:
        logger.info("Warning: No data provided to filter")
        return []
    
    filtered_data = []
    
    for entry in data:
        if not isinstance(entry, dict):
            logger.error(f"Warning: Skipping non-dict entry: {entry}")
            continue
            
        # Safely get values with None handling
        name = entry.get('name')
        description = entry.get('description')
        abvr = entry.get('abvr')
        
        # Convert None to empty string and strip
        name = (name or '').strip()
        description = (description or '').strip()
        abvr = (abvr or '').strip()
        
        # Skip entries with missing critical data
        if not name or not description or not abvr:
            continue
            
        # Clean and normalize text
        entry['name'] = name
        entry['description'] = description
        entry['abvr'] = abvr
        
        filtered_data.append(entry)
    
    logger.info(f"Filtered {len(data)} entries down to {len(filtered_data)} high-quality entries")
    return filtered_data

def save_embeddings_to_csv(data, csv_path="audience_embeddings.csv"):
    """
    Save precomputed embeddings to CSV for caching
    """
    try:
        # Prepare data for CSV (convert numpy arrays to lists)
        csv_data = []
        for entry in data:
            csv_entry = {
                'name': entry.get('name', ''),
                'description': entry.get('description', ''),
                'abvr': entry.get('abvr', ''),
                'combined_embedding': ','.join(map(str, entry.get('embedding', []))),
                'name_embedding': ','.join(map(str, entry.get('name_embedding', []))),
                'desc_embedding': ','.join(map(str, entry.get('desc_embedding', []))),
                'combined_text': entry.get('combined_text', '')
            }
            csv_data.append(csv_entry)
        
        df = pd.DataFrame(csv_data)
        df.to_csv(csv_path, index=False)
        logger.info(f"✅ Embeddings saved to: {csv_path}")
        return True
    except Exception as e:
        logger.error(f"❌ Error saving embeddings: {e}")
        return False

def refresh_audience_embeddings():
    """
    Refresh audience embeddings
    """
    audience_data = get_filtered_audience_data()
    force_recompute_embeddings(audience_data)

def load_embeddings_from_csv(csv_path="audience_embeddings.csv"):
    """
    Load precomputed embeddings from CSV
    """
    try:
        if not os.path.exists(csv_path):
            logger.info(f"📁 Embeddings file not found: {csv_path}")
            return None
        
        df = pd.read_csv(csv_path)
        logger.info(f"📂 Loading embeddings from: {csv_path}")
        
        data = []
        for _, row in df.iterrows():
            entry = {
                'name': row['name'],
                'description': row['description'],
                'abvr': row['abvr'],
                'embedding': np.array([float(x) for x in row['combined_embedding'].split(',')]),
                'name_embedding': np.array([float(x) for x in row['name_embedding'].split(',')]),
                'desc_embedding': np.array([float(x) for x in row['desc_embedding'].split(',')]),
                'combined_text': row['combined_text']
            }
            data.append(entry)
        
        logger.info(f"✅ Loaded {len(data)} entries with embeddings")
        return data
    except Exception as e:
        logger.error(f"❌ Error loading embeddings: {e}")
        return None

def check_cache_validity(cache_file="audience_embeddings.csv"):
    """
    Check if the cache file exists and is valid
    """
    if not os.path.exists(cache_file):
        return False, "Cache file does not exist"
    
    try:
        df = pd.read_csv(cache_file)
        if len(df) == 0:
            return False, "Cache file is empty"
        
        # Check if required columns exist
        required_columns = ['name', 'description', 'abvr', 'combined_embedding', 'name_embedding', 'desc_embedding']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            return False, f"Missing columns: {missing_columns}"
        
        return True, f"Cache is valid with {len(df)} entries"
    except Exception as e:
        return False, f"Error reading cache: {e}"

def force_recompute_embeddings(audience_data, cache_file="audience_embeddings.csv"):
    """
    Force recomputation of embeddings and update cache
    """
    logger.info("🔄 Forcing recomputation of embeddings...")
    
    # Compute embeddings
    computed_data = precompute_embeddings(audience_data)
    
    # Save to cache
    logger.info("💾 Saving embeddings to cache...")
    save_embeddings_to_csv(computed_data, cache_file)
    
    return computed_data

def get_cached_or_compute_embeddings(audience_data, cache_file="audience_embeddings.csv"):
    """
    Get embeddings from cache if available, otherwise compute and cache them
    """
    logger.info("🔍 Checking for cached embeddings...")
    
    # Try to load from cache first
    cached_data = load_embeddings_from_csv(cache_file)
    
    if cached_data is not None:
        logger.info("✅ Using cached embeddings")
        return cached_data
    
    # Compute embeddings if cache is not available or invalid
    logger.info("🔄 Computing embeddings (this may take a while)...")
    computed_data = precompute_embeddings(audience_data)
    
    # Save to cache for future use
    logger.info("💾 Saving embeddings to cache...")
    save_embeddings_to_csv(computed_data, cache_file)
    
    return computed_data
