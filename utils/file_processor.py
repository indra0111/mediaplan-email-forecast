import pandas as pd
import io
import csv
import logging
from typing import Dict, Any, List
from fastapi import UploadFile, HTTPException
import mimetypes
import chardet

logger = logging.getLogger(__name__)

class FileProcessor:
    """Utility class to process various file types and extract text content"""
    
    @staticmethod
    def detect_encoding(content: bytes) -> str:
        """Detect the encoding of file content"""
        try:
            result = chardet.detect(content)
            return result['encoding'] if result['encoding'] else 'utf-8'
        except Exception as e:
            logger.warning(f"Could not detect encoding, using utf-8: {e}")
            return 'utf-8'
    
    @staticmethod
    def process_text_file(content: bytes) -> str:
        """Process text files (.txt)"""
        try:
            encoding = FileProcessor.detect_encoding(content)
            text_content = content.decode(encoding, errors='ignore')
            logger.info(f"Successfully processed text file with encoding: {encoding}")
            return text_content
        except Exception as e:
            logger.error(f"Error processing text file: {e}")
            raise HTTPException(status_code=400, detail=f"Error processing text file: {str(e)}")
    
    @staticmethod
    def find_header_row(rows: List[List[str]], min_meaningful_cells: int = 2) -> int:
        """
        Find the first row that contains meaningful data (likely the header row)
        
        Args:
            rows: List of rows from CSV or Excel
            min_meaningful_cells: Minimum number of meaningful cells required to consider a row as header
            
        Returns:
            Index of the header row (0-based)
        """
        logger.info(f"Finding header row in {len(rows)} rows with min_meaningful_cells={min_meaningful_cells}")
        
        for idx, row in enumerate(rows):
            # Count meaningful cells in this row
            meaningful_cells = 0
            meaningful_content = []
            for cell in row:
                if cell and str(cell).strip() and str(cell).strip().lower() not in ['nan', 'none', '']:
                    meaningful_cells += 1
                    meaningful_content.append(str(cell).strip())
            
            logger.info(f"Row {idx}: {meaningful_cells} meaningful cells - {meaningful_content[:3]}...")
            
            # If this row has enough meaningful cells, it's likely the header
            if meaningful_cells >= min_meaningful_cells:
                logger.info(f"Found header row at index {idx}: {meaningful_content}")
                return idx
        
        # If no suitable header row found, default to first row
        logger.warning("No suitable header row found, defaulting to first row")
        return 0
    
    @staticmethod
    def process_csv_file(content: bytes) -> str:
        """Process CSV files and extract meaningful text content"""
        try:
            encoding = FileProcessor.detect_encoding(content)
            csv_content = content.decode(encoding, errors='ignore')
            
            # Read CSV content
            csv_reader = csv.reader(io.StringIO(csv_content))
            rows = list(csv_reader)
            
            if not rows:
                return "Empty CSV file"
            
            # Find the header row (first row with meaningful data)
            header_row_idx = FileProcessor.find_header_row(rows)
            headers = rows[header_row_idx] if header_row_idx < len(rows) else []
            
            # Get data rows (skip header row and any empty rows before it)
            data_rows = rows[header_row_idx + 1:]
            # Process all rows for small files, or up to 50 rows for larger files to ensure comprehensive analysis
            max_rows_to_process = min(50, len(data_rows))
            sample_rows = data_rows[:max_rows_to_process]
            
            # Create a structured summary
            summary = {
                "file_type": "CSV",
                "total_rows": len(rows),
                "header_row": header_row_idx + 1,  # 1-based for display
                "headers": headers,
                "sample_data": []
            }
            
            for i, row in enumerate(sample_rows, 1):
                if len(row) == len(headers):
                    row_dict = {headers[j]: row[j] for j in range(len(headers))}
                    summary["sample_data"].append(row_dict)
                else:
                    summary["sample_data"].append({"raw_data": row})
            
            # Convert to structured text format
            result_parts = [
                f"CSV FILE ANALYSIS:",
                f"Total Rows: {summary['total_rows']}",
                f"Header Row: {summary['header_row']}",
                f"Headers: {', '.join(summary['headers'])}",
                "",
                "SAMPLE DATA:"
            ]
            
            for i, row_data in enumerate(summary["sample_data"], 1):
                result_parts.append(f"Row {i}:")
                if "raw_data" in row_data:
                    result_parts.append(f"  Data: {row_data['raw_data']}")
                else:
                    for key, value in row_data.items():
                        if value and value.strip():  # Only show non-empty values
                            result_parts.append(f"  {key}: {value}")
                result_parts.append("")
            
            # Extract key insights from CSV data
            result_parts.append("KEY INSIGHTS:")
            
            # Look for location-related columns
            location_columns = [col for col in headers if any(loc_word in col.lower() for loc_word in ['location', 'city', 'state', 'region', 'area', 'market', 'geographic'])]
            if location_columns:
                result_parts.append(f"  Location columns found: {', '.join(location_columns)}")
                
                # Extract unique locations from all data rows
                location_data = []
                for col_idx, col_name in enumerate(headers):
                    if col_name in location_columns:
                        for row in data_rows:
                            if col_idx < len(row) and row[col_idx] and row[col_idx].strip():
                                location_data.append(row[col_idx].strip())
                
                if location_data:
                    unique_locations = list(set(location_data))  # Show all unique locations
                    result_parts.append(f"  Locations found: {', '.join(unique_locations)}")
            
            # Look for audience-related columns
            audience_columns = [col for col in headers if any(aud_word in col.lower() for aud_word in ['audience', 'target', 'demographic', 'segment', 'cohort', 'overall', 'primary', 'secondary'])]
            if audience_columns:
                result_parts.append(f"  Audience columns found: {', '.join(audience_columns)}")
                
                # Extract unique audience types from all data rows
                audience_data = []
                for col_idx, col_name in enumerate(headers):
                    if col_name in audience_columns:
                        for row in data_rows:
                            if col_idx < len(row) and row[col_idx] and row[col_idx].strip():
                                audience_data.append(row[col_idx].strip())
                
                if audience_data:
                    unique_audiences = list(set(audience_data))  # Show all unique audience types
                    result_parts.append(f"  Audience types found: {', '.join(unique_audiences)}")
            
            # Look for business-related columns
            business_columns = [col for col in headers if any(bus_word in col.lower() for bus_word in ['business', 'industry', 'sector', 'company', 'brand', 'product', 'til', 'isv', 'osv', 'banners'])]
            if business_columns:
                result_parts.append(f"  Business columns found: {', '.join(business_columns)}")
            
            result = "\n".join(result_parts)
            logger.info(f"Successfully processed CSV file with {len(rows)} rows, header at row {header_row_idx + 1} and results: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error processing CSV file: {e}")
            raise HTTPException(status_code=400, detail=f"Error processing CSV file: {str(e)}")
    
    @staticmethod
    def clean_column_name(col_name):
        """Clean and standardize column names"""
        if pd.isna(col_name):
            return "Unnamed_Column"
        
        # Convert to string and clean
        col_str = str(col_name).strip()
        if not col_str or col_str == "nan":
            return "Unnamed_Column"
        
        # Remove special characters and replace spaces with underscores
        import re
        cleaned = re.sub(r'[^\w\s-]', '', col_str)
        cleaned = re.sub(r'[-\s]+', '_', cleaned)
        return cleaned.lower() if cleaned else "Unnamed_Column"
    
    @staticmethod
    def is_meaningful_column(col_name):
        """Check if a column name is meaningful (not unnamed or empty)"""
        if pd.isna(col_name):
            return False
        
        col_str = str(col_name).strip().lower()
        
        # Check for common meaningless column names
        meaningless_patterns = [
            'nan', 'none', '', 'unnamed', 'unnamed_', 'column_', 'col_',
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'  # Single digits
        ]
        
        for pattern in meaningless_patterns:
            if col_str == pattern or col_str.startswith(pattern):
                return False
        
        # Must have some meaningful content
        return len(col_str) > 0

    @staticmethod
    def process_excel_file(content: bytes) -> str:
        """Process Excel files (.xlsx, .xls) and extract meaningful text content"""
        try:
            # Read Excel file from bytes
            excel_data = io.BytesIO(content)
            
            # Try to read all sheets
            excel_file = pd.ExcelFile(excel_data)
            sheet_names = excel_file.sheet_names
            
            result_parts = [f"EXCEL FILE ANALYSIS: {len(sheet_names)} sheet(s)"]
            
            for sheet_name in sheet_names:
                try:
                    # Read the full sheet to get accurate row count
                    full_df = pd.read_excel(excel_data, sheet_name=sheet_name)
                    total_rows = len(full_df)
                    
                    # Read first 200 rows for analysis to ensure comprehensive data processing
                    df = pd.read_excel(excel_data, sheet_name=sheet_name, nrows=200)
                    
                    if df.empty:
                        result_parts.append(f"\nSHEET: {sheet_name}")
                        result_parts.append("Status: Empty sheet")
                        continue
                    
                    logger.info(f"Processing sheet '{sheet_name}' with {total_rows} total rows")
                    
                    # Convert DataFrame to list of lists for header detection
                    rows = df.values.tolist()
                    
                    # Find the first row that looks like headers (has meaningful text)
                    header_row = FileProcessor.find_header_row(rows, min_meaningful_cells=2)
                    
                    logger.info(f"Detected header row at index {header_row} for sheet '{sheet_name}'")
                    
                    # Re-read with proper header row - read more rows for comprehensive analysis
                    df_with_headers = pd.read_excel(excel_data, sheet_name=sheet_name, header=header_row, nrows=200)
                    
                    # Log the detected headers
                    logger.info(f"Headers detected: {list(df_with_headers.columns)}")
                    
                    # Filter out unnamed/empty columns
                    meaningful_columns = []
                    for col in df_with_headers.columns:
                        if FileProcessor.is_meaningful_column(col):
                            meaningful_columns.append(col)
                    
                    logger.info(f"Meaningful columns: {meaningful_columns}")
                    
                    # If no meaningful columns found, try to infer from data
                    if not meaningful_columns:
                        logger.warning("No meaningful columns found, trying to infer from data")
                        # Look for the first row with meaningful data
                        for idx, row in df_with_headers.iterrows():
                            meaningful_data = [str(cell).strip() for cell in row if pd.notna(cell) and str(cell).strip() and str(cell).strip() != "nan"]
                            if len(meaningful_data) >= 2:
                                # Use this row as headers
                                df_with_headers.columns = [f"Column_{i}" for i in range(len(df_with_headers.columns))]
                                logger.info(f"Using row {idx} as headers: {meaningful_data}")
                                break
                        meaningful_columns = df_with_headers.columns.tolist()
                    
                    # Keep only meaningful columns
                    df_clean = df_with_headers[meaningful_columns].copy()
                    
                    result_parts.append(f"\nSHEET: {sheet_name}")
                    result_parts.append(f"Total Rows: {total_rows}")
                    result_parts.append(f"Header Row: {header_row + 1}")  # 1-based for display
                    result_parts.append(f"Meaningful Columns: {', '.join(meaningful_columns)}")
                    
                    # Analyze data structure
                    data_types = df_clean.dtypes.to_dict()
                    result_parts.append("Data Types:")
                    for col, dtype in data_types.items():
                        result_parts.append(f"  {col}: {dtype}")
                    
                    # Show sample data in a structured format
                    result_parts.append("\nSAMPLE DATA:")
                    # For small files, show all rows. For larger files, show up to 50 rows for comprehensive analysis
                    max_rows_to_show = min(50, len(df_clean))
                    for idx, row in df_clean.head(max_rows_to_show).iterrows():
                        result_parts.append(f"Row {idx + 1}:")
                        for col in meaningful_columns:
                            value = row[col]
                            if pd.notna(value) and str(value).strip() and str(value).strip() != "nan":
                                result_parts.append(f"  {col}: {value}")
                        result_parts.append("")
                    
                    # Extract key insights
                    result_parts.append("KEY INSIGHTS:")
                    
                    # Look for location-related data
                    location_columns = [col for col in meaningful_columns if any(loc_word in col.lower() for loc_word in ['location', 'city', 'state', 'region', 'area', 'market', 'geographic'])]
                    if location_columns:
                        result_parts.append(f"  Location columns found: {', '.join(location_columns)}")
                    
                    # Look for audience-related data
                    audience_columns = [col for col in meaningful_columns if any(aud_word in col.lower() for aud_word in ['audience', 'target', 'demographic', 'segment', 'cohort', 'overall', 'primary', 'secondary'])]
                    if audience_columns:
                        result_parts.append(f"  Audience columns found: {', '.join(audience_columns)}")
                    
                    # Look for business-related data
                    business_columns = [col for col in meaningful_columns if any(bus_word in col.lower() for bus_word in ['business', 'industry', 'sector', 'company', 'brand', 'product', 'til', 'isv', 'osv', 'banners'])]
                    if business_columns:
                        result_parts.append(f"  Business columns found: {', '.join(business_columns)}")
                    
                    # Check for numeric data that might be metrics
                    numeric_columns = df_clean.select_dtypes(include=['number']).columns.tolist()
                    if numeric_columns:
                        result_parts.append(f"  Numeric metrics: {', '.join(numeric_columns)}")
                    
                    # Extract actual location names from the full dataset for better coverage
                    location_data = []
                    if location_columns:
                        # Read the full dataset for location extraction
                        df_full_locations = pd.read_excel(excel_data, sheet_name=sheet_name, header=header_row)
                        df_full_locations_clean = df_full_locations[meaningful_columns].copy()
                        
                        for col in location_columns:
                            if col in df_full_locations_clean.columns:
                                unique_locations = df_full_locations_clean[col].dropna().unique()
                                location_data.extend([str(loc).strip() for loc in unique_locations if str(loc).strip() and str(loc).strip() != "nan"])
                    
                    if location_data:
                        # Show all unique locations for comprehensive analysis
                        unique_locations = list(set(location_data))
                        result_parts.append(f"  Locations found: {', '.join(unique_locations)}")
                    
                    # Extract audience types from the full dataset for better coverage
                    audience_data = []
                    if audience_columns:
                        # Use the same full dataset for audience extraction
                        for col in audience_columns:
                            if col in df_full_locations_clean.columns:
                                unique_audiences = df_full_locations_clean[col].dropna().unique()
                                audience_data.extend([str(aud).strip() for aud in unique_audiences if str(aud).strip() and str(aud).strip() != "nan"])
                    
                    if audience_data:
                        # Show all unique audience types for comprehensive analysis
                        unique_audiences = list(set(audience_data))
                        result_parts.append(f"  Audience types found: {', '.join(unique_audiences)}")
                    
                except Exception as e:
                    logger.warning(f"Error reading sheet '{sheet_name}': {e}")
                    result_parts.append(f"\nSHEET: {sheet_name}")
                    result_parts.append(f"Error: {str(e)}")
            
            result = "\n".join(result_parts)
            logger.info(f"Successfully processed Excel file with {len(sheet_names)} sheets and results: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error processing Excel file: {e}")
            raise HTTPException(status_code=400, detail=f"Error processing Excel file: {str(e)}")
    
    @staticmethod
    def process_file(file: UploadFile) -> Dict[str, Any]:
        """Main method to process uploaded files"""
        try:
            content = file.file.read()
            file.file.seek(0)  # Reset file pointer for potential future reads
            
            # Get file extension and MIME type
            file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else ''
            mime_type = file.content_type or mimetypes.guess_type(file.filename)[0]
            
            logger.info(f"Processing file: {file.filename}, type: {mime_type}, size: {len(content)} bytes")
            
            # Process based on file type
            if file_extension in ['txt'] or mime_type == 'text/plain':
                extracted_text = FileProcessor.process_text_file(content)
                file_type = 'text'
            elif file_extension in ['csv'] or mime_type == 'text/csv':
                extracted_text = FileProcessor.process_csv_file(content)
                file_type = 'csv'
            elif file_extension in ['xlsx', 'xls'] or mime_type in ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']:
                extracted_text = FileProcessor.process_excel_file(content)
                file_type = 'excel'
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_extension} ({mime_type})")
            
            return {
                'filename': file.filename,
                'file_type': file_type,
                'file_size': len(content),
                'extracted_content': extracted_text,
                'original_content': content  # Keep original content for potential future use
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error processing file {file.filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
    
    @staticmethod
    def extract_keywords_from_file_content(content: str) -> List[str]:
        """Extract relevant keywords from file content for audience targeting"""
        import re
        
        # Enhanced business and industry keywords
        business_keywords = [
            'business', 'industry', 'manufacturing', 'retail', 'finance', 'technology',
            'healthcare', 'education', 'real estate', 'agriculture', 'automotive',
            'fashion', 'food', 'beverage', 'pharmaceutical', 'logistics', 'transportation',
            'marketing', 'advertising', 'consulting', 'services', 'products', 'sales',
            'customers', 'clients', 'partners', 'suppliers', 'vendors', 'employees',
            'revenue', 'profit', 'growth', 'expansion', 'investment', 'funding',
            'startup', 'enterprise', 'sme', 'corporate', 'company', 'organization',
            'audience', 'target', 'demographic', 'segment', 'cohort', 'market',
            'location', 'city', 'state', 'region', 'area', 'geographic',
            'til', 'isv', 'osv', 'banners', 'overall', 'primary', 'secondary'
        ]
        
        # Extract words that match business keywords
        words = re.findall(r'\b\w+\b', content.lower())
        extracted_keywords = []
        
        for word in words:
            if word in business_keywords and word not in extracted_keywords:
                extracted_keywords.append(word)
        
        # Extract location names (capitalized words that might be places)
        location_pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b'
        locations = re.findall(location_pattern, content)
        for location in locations:
            if len(location.strip()) > 2 and location.strip() not in extracted_keywords:
                extracted_keywords.append(location.strip())
        
        # Extract any other capitalized terms that might be important
        capitalized_terms = re.findall(r'\b[A-Z][a-zA-Z0-9\s&]+(?:\s+[A-Z][a-zA-Z0-9\s&]+)*\b', content)
        for term in capitalized_terms:
            if len(term.strip()) > 2 and term.strip() not in extracted_keywords:
                extracted_keywords.append(term.strip())
        
        return extracted_keywords[:25]  # Limit to top 25 keywords