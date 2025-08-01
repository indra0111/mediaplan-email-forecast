let currentData = null;
let availableCohorts = []; // Store all available cohorts for searching
let abvrsSelectedFromCohorts = {}; // Store all ABVRs selected from cohorts
let availableLocations = []; // Store all available locations for searching
let availableLocationGroups = {}; // Store all available location groups for searching
let selectedCohortFromDropdown = null;
let selectedABVRFromDropdown = null;
let selectedIncludedLocationFromDropdown = null;
let selectedExcludedLocationFromDropdown = null;
let highlightedIndex = -1;
let abvrHighlightedIndex = -1;
let locationHighlightedIndex = -1;
let excludedLocationHighlightedIndex = -1;
let includedLocationChips = []; // Array to store included location chips
let excludedLocationChips = []; // Array to store excluded location chips
let selectedFiles = []; // Array to store selected files
let currentForecastData = null; // Store the current forecast data for CSV download
let modalSingleLocation = null; // Store the selected single location in modal
let modalIncludedLocations = []; // Store included locations in modal
let modalExcludedLocations = []; // Store excluded locations in modal
// API URLs - these should be configured based on your deployment environment
const API_CONFIG = {
    cohorts_api_url: 'http://172.29.83.22:8080',
    audience_api_url: 'http://172.29.83.21:8081',
    // locations_api_url: 'http://172.23.53.62:8081',
    locations_api_url: 'http://172.29.83.22:8080',
    presentation_api_url: 'http://localhost:8001'
};

function showError(message, duration = 5000) {
    const error = document.getElementById('error');
    if (error) {
        error.textContent = message;
        error.style.color = '#d32f2f';
        error.style.backgroundColor = '#ffebee';
        error.style.borderColor = '#f44336';
        error.classList.add('show');
        
        // Scroll to error
        error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Auto-hide after duration
        setTimeout(() => {
            error.classList.remove('show');
            error.textContent = '';
        }, duration);
    }
}

function showSuccess(message, duration = 3000) {
    const error = document.getElementById('error');
    if (error) {
        error.textContent = message;
        error.style.color = '#2e7d32';
        error.style.backgroundColor = '#e8f5e8';
        error.style.borderColor = '#4caf50';
        error.classList.add('show');
        
        // Don't scroll for success messages - they're not critical
        // error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Auto-hide after duration
        setTimeout(() => {
            error.classList.remove('show');
            error.textContent = '';
        }, duration);
    }
}

// Toast Notification System
let toastCounter = 0;

function showToast(options) {
    const {
        title = '',
        message = '',
        type = 'info', // 'success', 'error', 'warning', 'info'
        duration = 5000,
        showProgress = true,
        closable = true
    } = options;

    const toastId = `toast-${++toastCounter}`;
    const container = document.getElementById('toastContainer');
    
    if (!container) {
        console.error('Toast container not found');
        return;
    }

    // Get icon based on type
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast ${type} ${showProgress ? 'progress' : ''}`;
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            ${title ? `<div class="toast-title">${title}</div>` : ''}
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        ${closable ? '<button class="toast-close" onclick="removeToast(\'' + toastId + '\')">×</button>' : ''}
    `;

    container.appendChild(toast);

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toastId);
        }, duration);
    }

    return toastId;
}

function removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
}

// Convenience functions for different toast types
function showSuccessToast(title, message, duration = 4000) {
    return showToast({
        title,
        message,
        type: 'success',
        duration,
        showProgress: true
    });
}

function showErrorToast(title, message, duration = 6000) {
    return showToast({
        title,
        message,
        type: 'error',
        duration,
        showProgress: true
    });
}

function showWarningToast(title, message, duration = 5000) {
    return showToast({
        title,
        message,
        type: 'warning',
        duration,
        showProgress: true
    });
}

function showInfoToast(title, message, duration = 4000) {
    return showToast({
        title,
        message,
        type: 'info',
        duration,
        showProgress: true
    });
}

// File upload functionality
document.addEventListener('DOMContentLoaded', function() {
    setupFileUpload();
});

function setupFileUpload() {
    const fileInput = document.getElementById('fileUpload');
    const fileUploadContainer = document.querySelector('.file-upload-container');
    const fileList = document.getElementById('fileList');
    
    // Handle file selection
    fileInput.addEventListener('change', handleFileSelect);
    
    // Handle drag and drop
    fileUploadContainer.addEventListener('click', () => fileInput.click());
    
    fileUploadContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadContainer.classList.add('dragover');
    });
    
    fileUploadContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileUploadContainer.classList.remove('dragover');
    });
    
    fileUploadContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadContainer.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

function handleFiles(files) {
    const validFiles = files.filter(file => {
        const validTypes = ['.csv', '.xlsx', '.xls', '.txt'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validTypes.includes(fileExtension)) {
            showErrorToast('Invalid File Type', `Invalid file type: ${file.name}. Supported types: CSV, Excel, Text files.`);
            return false;
        }
        
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            showErrorToast('File Too Large', `File too large: ${file.name}. Maximum size: 10MB.`);
            return false;
        }
        
        return true;
    });
    
    // Add valid files to selected files
    selectedFiles = selectedFiles.concat(validFiles);
    updateFileList();
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileIcon = getFileIcon(file.name);
        const fileSize = formatFileSize(file.size);
        
        fileItem.innerHTML = `
            <div class="file-item-info">
                <span class="file-icon">${fileIcon}</span>
                <div>
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${fileSize}</div>
                </div>
            </div>
            <button class="file-remove" onclick="removeFile(${index})">×</button>
        `;
        
        fileList.appendChild(fileItem);
    });
}

function getFileIcon(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    switch (extension) {
        case 'csv': return '📊';
        case 'xlsx': case 'xls': return '📈';
        case 'txt': return '📄';
        default: return '📁';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
}

function formatLocationGroups(unformattedAvailableLocationGroups) {
    const formatted = {};
    for (const [key, value] of Object.entries(unformattedAvailableLocationGroups)) {
        formatted[key] = {
            includedLocations: value.includedLocations.map(loc => loc.name+","+loc.countryCode+","+loc.type),
            excludedLocations: value.excludedLocations.map(loc => loc.name+","+loc.countryCode+","+loc.type),
            nameAsId: value.nameAsId
        };
    }
    return formatted;
}

document.getElementById('emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailForm = document.getElementById('emailForm');
    const submitButton = emailForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    const subject = document.getElementById('subject').value;
    const body = document.getElementById('body').value;
    const error = document.getElementById('error');
    const editableForm = document.getElementById('editableForm');
    const forecastResults = document.getElementById('forecastResults');
    
    // Disable the submit button and change its text
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';

    // Clear previous results
    error.textContent = '';
    editableForm.classList.add('hidden');
    forecastResults.innerHTML = '';
    
    try {
        const formData = new FormData();
        formData.append('subject', subject);
        formData.append('body', body);
        
        selectedFiles.forEach(file => {
            formData.append('files', file);
        });
        const response = await fetch('/process-email', {
            method: 'POST',
            body: formData
        });
        const data = await response.json(); 
        if (response.ok) {
            currentData = data;
            // Get all available cohorts from the helper
            availableCohorts = await getAllAvailableCohorts();
            abvrsSelectedFromCohorts = await getAllAvailableABVRsForSelectedCohorts();
            console.log(`abvrsSelectedFromCohorts: `, abvrsSelectedFromCohorts);
            // Get all available locations from the API
            availableLocations = await getAllAvailableLocations();
            // Get all available location groups from the API
            const unformattedAvailableLocationGroups = await getAllAvailableLocationGroups();
            availableLocationGroups = formatLocationGroups(unformattedAvailableLocationGroups);
            displayEditableForm(data);
            editableForm.classList.remove('hidden');
            
            // Render chips AFTER locations are fetched and form is displayed
            renderIncludedLocationChips();
            renderExcludedLocationChips();

            const locations_not_found = data.locations_not_found;
            if (locations_not_found.length > 0) {
                displayLocationsNotFound(locations_not_found);
            }
        } else {
            showErrorToast('Processing Error', data.detail || 'An error occurred');
        }
    } catch (err) {
        console.error('Error details:', err);
        showErrorToast('Request Error', 'An error occurred while processing the request: ' + err.message);
    } finally {
        // Re-enable the submit button and restore its text
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
});

async function getAllAvailableABVRsForSelectedCohorts() {
    try {
        const abvrsFromCohort = new Set();
        const filteredCohorts = availableCohorts.filter(cohort => currentData.cohort.includes(cohort.name));
        for (const cohort of filteredCohorts) {
            const abvrs = cohort?.abvrs?.split(",").map(abvr => abvr.trim());
            for (const abvr of abvrs) {
                abvrsFromCohort.add(abvr);
            }
        }
        const response = await fetch(`${API_CONFIG.audience_api_url}/getAudienceInfo`, {
            method: 'POST',
            body: Array.from(abvrsFromCohort).join(",")
        });
        const data = await response.json();
        return data.reduce((acc, abvr) => {
            acc[abvr.abvr] = {
              name: abvr.audience_name,
              description: abvr.description
            };
            return acc;
          }, {});
          
    } catch (err) {
        console.error('Error fetching ABVRs for selected cohorts:', err);
        return {};
    }
}

async function getAllAvailableCohorts() {
    try {
        const response = await fetch(`${API_CONFIG.cohorts_api_url}/get-all-mediaplan-cohorts`);
        const data = await response.json();
        return data.map(cohort => ({name: cohort.name, abvrs: cohort.abvrs}));
    } catch (err) {
        console.error('Error fetching cohorts:', err);
        return [];
    }
}

async function getAllAvailableLocations() {
    try {
        const response = await fetch(`${API_CONFIG.locations_api_url}/locations`);
        const data = await response.json();
        // Assuming the API returns an array of location objects with a 'name' property
        // Adjust this based on the actual API response structure
        return data.map(location => ({name:location.name + "," + location.countryCode + "," + location.type,id:location.locationId}));
    } catch (err) {
        console.error('Error fetching locations:', err);
        return [];
    }
}

async function getAllAvailableLocationGroups() {
    try {
        const response = await fetch(`${API_CONFIG.locations_api_url}/location-groups`);
        const data = await response.json();

        const transformed = {};

        for (const groupName in data) {
            const locations = data[groupName].locations || [];

            const includedLocations = locations.map(loc => ({
                name: `${loc.name},${loc.countryCode},${loc.type}`,
                id: loc.locationId
            }));

            transformed[groupName] = {
                includedLocations,
                excludedLocations: [],
                nameAsId: groupName
            };
        }

        return transformed;
    } catch (err) {
        console.error('Error fetching location groups:', err);
        return {};
    }
}


function setupCohortSearch() {
    const searchInput = document.getElementById('cohortSearch');
    const dropdown = document.getElementById('searchDropdown');
    
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        highlightedIndex = -1;
        
        if (searchTerm.length === 0) {
            hideDropdown();
            return;
        }
        const cohortNames = availableCohorts.map(cohort => cohort.name);
        const matchingCohorts = cohortNames.filter(cohort =>
            cohort.toLowerCase().includes(searchTerm) &&
            !currentData.cohort.includes(cohort)
        );
        
        showDropdown(matchingCohorts, searchTerm);
    });
    
    searchInput.addEventListener('keydown', function(e) {
        const dropdownItems = dropdown.querySelectorAll('.search-dropdown-item:not(.no-results)');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, dropdownItems.length - 1);
            updateHighlight(dropdownItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, -1);
            updateHighlight(dropdownItems);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && dropdownItems[highlightedIndex]) {
                selectCohortFromDropdown(dropdownItems[highlightedIndex].textContent);
            } else {
                addSelectedCohort();
            }
        } else if (e.key === 'Escape') {
            hideDropdown();
        }
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown();
        }
    });
}

function showDropdown(matchingCohorts, searchTerm) {
    const dropdown = document.getElementById('searchDropdown');
    
    if (matchingCohorts.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching cohorts found</div>';
    } else {
        dropdown.innerHTML = matchingCohorts.map(cohort => 
            `<div class="search-dropdown-item" onclick="selectCohortFromDropdown('${cohort}')">${cohort}</div>`
        ).join('');
    }
    
    dropdown.style.display = 'block';
}

function showLocationDropdown(matchingOptions, searchTerm, type) {
    const dropdown = document.getElementById('includedLocationSearchDropdown');
    if (!dropdown) return;
    
    if (matchingOptions.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching locations or groups found</div>';
    } else {
        dropdown.innerHTML = matchingOptions.map((option, idx) => {
            const isGroup = option.type === 'group';
            const groupClass = isGroup ? 'location-group-item' : '';
            const groupIcon = isGroup ? '🏢 ' : '';
            const groupSuffix = isGroup ? ' (Group)' : '';
            return `<div class="search-dropdown-item ${groupClass}" data-idx="${idx}">${groupIcon}${option.name}${groupSuffix}</div>`;
        }).join('');
        // Add click event listeners
        const items = dropdown.querySelectorAll('.search-dropdown-item');
        items.forEach((item, idx) => {
            item.addEventListener('click', function() {
                selectIncludedLocationFromDropdown(matchingOptions[idx]);
            });
        });
    }
    
    // Store for Enter key
    dropdown._matchingOptions = matchingOptions;
    dropdown.style.display = 'block';
}

function showExcludedLocationDropdown(matchingLocations, searchTerm) {
    const dropdown = document.getElementById('excludedLocationSearchDropdown');
    if (!dropdown) return;
    
    if (matchingLocations.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching locations found</div>';
    } else {
        dropdown.innerHTML = matchingLocations.map((location, idx) => 
            `<div class="search-dropdown-item" data-idx="${idx}">${location.name}</div>`
        ).join('');
        
        // Add click event listeners
        const items = dropdown.querySelectorAll('.search-dropdown-item');
        items.forEach((item, idx) => {
            item.addEventListener('click', function() {
                selectExcludedLocationFromDropdown(matchingLocations[idx]);
            });
        });
    }
    
    // Store for Enter key
    dropdown._matchingLocations = matchingLocations;
    dropdown.style.display = 'block';
}

function hideDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    dropdown.style.display = 'none';
    highlightedIndex = -1;
}

function hideLocationDropdown() {
    const dropdown = document.getElementById('includedLocationSearchDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    locationHighlightedIndex = -1;
}

function hideExcludedLocationDropdown() {
    const dropdown = document.getElementById('excludedLocationSearchDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    excludedLocationHighlightedIndex = -1;
}

function updateHighlight(dropdownItems) {
    dropdownItems.forEach((item, index) => {
        if (index === highlightedIndex) {
            item.classList.add('highlighted');
            selectedCohortFromDropdown = item.textContent;
        } else {
            item.classList.remove('highlighted');
        }
    });
    
    if (highlightedIndex === -1) {
        selectedCohortFromDropdown = null;
    }
}

function updateLocationHighlight(dropdownItems) {
    dropdownItems.forEach((item, index) => {
        if (index === locationHighlightedIndex) {
            item.classList.add('highlighted');
            selectedIncludedLocationFromDropdown = item.textContent;
        } else {
            item.classList.remove('highlighted');
        }
    });
    
    if (locationHighlightedIndex === -1) {
        selectedIncludedLocationFromDropdown = null;
    }
}

function updateExcludedLocationHighlight(dropdownItems) {
    dropdownItems.forEach((item, index) => {
        if (index === excludedLocationHighlightedIndex) {
            item.classList.add('highlighted');
            selectedExcludedLocationFromDropdown = item.textContent;
        } else {
            item.classList.remove('highlighted');
        }
    });
    
    if (excludedLocationHighlightedIndex === -1) {
        selectedExcludedLocationFromDropdown = null;
    }
}

function selectCohortFromDropdown(cohort) {
    selectedCohortFromDropdown = cohort;
    document.getElementById('cohortSearch').value = cohort;
    hideDropdown();
}

function selectIncludedLocationFromDropdown(option) {
    console.log("option in selectIncludedLocationFromDropdown", option);
    
    // If group, clear chips and disable excluded, set nameAsId
    if (option.type === 'group') {
        // Use the group data to create the proper location object
        const groupData = option.groupData;
        includedLocationChips = [{
            name: option.name,
            type: 'group',
            groupData: groupData
        }];
        excludedLocationChips = [];
        renderIncludedLocationChips();
        renderExcludedLocationChips();
        // Disable excluded input
        const excludedInput = document.getElementById('excludedLocationInput');
        if (excludedInput) excludedInput.disabled = true;
        // Set nameAsId
        const nameAsIdInput = document.getElementById('nameAsIdInput');
        if (nameAsIdInput){
            nameAsIdInput.value = option.name;
            nameAsIdInput.disabled = true;
        }
    } else {
        // If not group, enable excluded input
        const excludedInput = document.getElementById('excludedLocationInput');
        if (excludedInput) excludedInput.disabled = false;
        // Add to chips array if not already present
        if (!includedLocationChips.some(chip => chip.name === option.name)) {
            includedLocationChips.push(option);
            renderIncludedLocationChips();
        }
    }
    selectedIncludedLocationFromDropdown = option.name;
    hideLocationDropdown();
    // Clear the input
    const input = document.getElementById('includedLocationInput');
    if (input) input.value = '';
}

function selectExcludedLocationFromDropdown(location) {
    let locationObj;
    if (typeof location === 'string') {
        // Find the location object from availableLocations
        const foundLocation = availableLocations.find(loc => loc.name === location);
        locationObj = foundLocation || { name: location, type: 'location' };
    } else {
        locationObj = location;
    }
    
    // Add to chips array if not already present
    if (!excludedLocationChips.some(chip => chip.name === locationObj.name)) {
        excludedLocationChips.push(locationObj);
        renderExcludedLocationChips();
    }
    
    selectedExcludedLocationFromDropdown = locationObj.name;
    hideExcludedLocationDropdown();
    
    // Clear the input
    const input = document.getElementById('excludedLocationInput');
    if (input) input.value = '';
}

async function addSelectedCohort() {
    const searchInput = document.getElementById('cohortSearch');
    let cohortToAdd = selectedCohortFromDropdown || searchInput.value.trim();
    
    if (!cohortToAdd) {
        showErrorToast('Missing Cohort', 'Please select or enter a cohort name.');
        return;
    }
    
    // Check if cohort exists in available cohorts
    const cohortNames = availableCohorts.map(cohort => cohort.name);
    const exactMatch = cohortNames.find(cohort => 
        cohort.toLowerCase() === cohortToAdd.toLowerCase()
    );
    
    if (!exactMatch) {
        showErrorToast('Cohort Not Found', `Cohort "${cohortToAdd}" not found in available cohorts.`);
        return;
    }
    
    // Check if already selected
    if (currentData.cohort.includes(exactMatch)) {
        showErrorToast('Already Selected', `Cohort "${exactMatch}" is already selected.`);
        return;
    }
    
    // Add the cohort
    currentData.cohort.push(exactMatch);

    abvrsSelectedFromCohorts = await getAllAvailableABVRsForSelectedCohorts();
    // Refresh the display
    displayEditableForm(currentData);
    
    // Re-render chips after form refresh
    renderIncludedLocationChips();
    renderExcludedLocationChips();
    
    // Clear the search input and reset selection
    searchInput.value = '';
    selectedCohortFromDropdown = null;
    hideDropdown();
    
    // Show success message
    showSuccessToast('Cohort Added', `Added "${exactMatch}" to the selection.`);
}

function displayEditableForm(data) {
    // Display Cohorts with checkboxes and "Select All" option
    const cohortsContainer = document.getElementById('cohortsContainer');
    cohortsContainer.innerHTML = `
        <div class="select-all-section">
            <input type="checkbox" id="selectAllCohorts" checked>
            <label for="selectAllCohorts"><strong>Select All Cohorts</strong></label>
        </div>
        ${data.cohort.map(cohort => `
            <div class="cohort-item">
                <input type="checkbox" class="cohort-checkbox" value="${cohort}" checked>
                <span class="cohort-tag">${cohort}</span>
            </div>
        `).join('')}
    `;
    
    // Display Locations with checkboxes and "Select All" option
    const locationsContainer = document.getElementById('locationsContainer');
    const locations = data.locations || [];
    console.log("locations in displayEditableForm", locations);
    locationsContainer.innerHTML = `
        <div class="location-select-all">
            <input type="checkbox" id="selectAllLocations" checked>
            <label for="selectAllLocations"><strong>Select All Locations</strong></label>
        </div>
        ${locations.map((location, index) => {
            // Handle different location data formats
            let included = '';
            let excluded = '';
            
            if (location.includedLocations && Array.isArray(location.includedLocations)) {
                // Check if this is a location group (has nameAsId that matches a group name)
                const isGroup = location.nameAsId && availableLocationGroups && availableLocationGroups[location.nameAsId];
                
                if (isGroup) {
                    // For location groups, just show the group name
                    included = location.nameAsId;
                } else {
                    // For individual locations, show the location names
                    included = location.includedLocations.map(loc => {
                        // Handle both string and object formats
                        if (typeof loc === 'string') {
                            return loc;
                        } else if (loc && typeof loc === 'object' && loc.name) {
                            return loc.name;
                        } else {
                            return String(loc);
                        }
                    }).join(' | ');
                }
            }
            
            if (location.excludedLocations && Array.isArray(location.excludedLocations)) {
                excluded = location.excludedLocations.map(loc => {
                    // Handle both string and object formats
                    if (typeof loc === 'string') {
                        return loc;
                    } else if (loc && typeof loc === 'object' && loc.name) {
                        return loc.name;
                    } else {
                        return String(loc);
                    }
                }).join(' | ');
            }
            
            const excludedText = excluded ? ` (Excluded: ${excluded})` : '';
            const nameAsId = location.nameAsId && !availableLocationGroups[location.nameAsId] ? ` (ID: ${location.nameAsId})` : '';
            
            return `<div class="location-item">
                <input type="checkbox" class="location-checkbox" value="${index}" checked>
                <div class="location-content">
                    <div class="location-included">${included}${excludedText}${nameAsId}</div>
                </div>
            </div>`;
        }).join('')}
    `;
    
    // Display Presets with checkboxes and "Select All" option
    const presetsContainer = document.getElementById('presetsContainer');
    const presets = data.preset || [];
    presetsContainer.innerHTML = `
        <div class="select-all-section">
            <input type="checkbox" id="selectAllPresets" checked>
            <label for="selectAllPresets"><strong>Select All Presets</strong></label>
        </div>
        ${presets.map(preset => `
            <div class="preset-item">
                <input type="checkbox" class="preset-checkbox" value="${preset}" checked>
                <span class="preset-tag">${preset}</span>
            </div>
        `).join('')}
    `;
    
    // Display Keywords with checkboxes and "Select All" option
    const keywordsContainer = document.getElementById('keywordsContainer');
    const keywords = data.keywords || [];
    keywordsContainer.innerHTML = `
        <div class="select-all-section">
            <input type="checkbox" id="selectAllKeywords" checked>
            <label for="selectAllKeywords"><strong>Select All Keywords</strong></label>
        </div>
        ${keywords.map(keyword => `
            <div class="keyword-item">
                <input type="checkbox" class="keyword-checkbox" value="${keyword}" checked>
                <span class="keyword-tag">${keyword}</span>
            </div>
        `).join('')}
    `;
    
    // Set Creative Settings
    document.getElementById('creativeSize').value = data.creative_size;
    document.getElementById('deviceCategory').value = data.device_category.split(" ")[0];
    document.getElementById('targetGender').value = data.target_gender;
    document.getElementById('duration').value = parseInt(data.duration.split(" ")[0]);

    // Set Age Selection
    const selectedAges = data.target_age || [];
    const ageCheckboxes = document.querySelectorAll('.age-checkbox');
    
    // Clear all checkboxes first
    ageCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Check the appropriate ones
    ageCheckboxes.forEach(checkbox => {
        if (selectedAges.includes(checkbox.value)) {
            checkbox.checked = true;
        }
    });
    
    // Update the display
    updateAgeSelectedDisplay();

    // Display ABVRs with checkboxes and "Select All" option
    const abvrsContainer = document.getElementById('abvrsContainer');
    const abvr_array_from_selected_cohorts = Object.entries(abvrsSelectedFromCohorts).map(([abvrCode, _]) => (abvrCode));
    const unfiltered_abvrs = data.abvrs || [];
    const abvrs = unfiltered_abvrs.filter(abvr => !abvr_array_from_selected_cohorts.includes(abvr.abvr));
    const unfiltered_left_abvrs = data.left_abvrs || [];
    const leftAbvrs = unfiltered_left_abvrs.filter(abvr => !abvr_array_from_selected_cohorts.includes(abvr.abvr));
    // Convert abvrsSelectedFromCohorts object to array for display
    const cohortAbvrs = Object.entries(abvrsSelectedFromCohorts).map(([abvrCode, abvrData]) => ({
        abvr: abvrCode,
        name: abvrData.name,
        description: abvrData.description,
        similarity: 1.0 // Default similarity for cohort ABVRs
    }));
    console.log(`cohortAbvrs: `, cohortAbvrs);
    abvrsContainer.innerHTML = `
        <div class="abvr-select-all">
            <input type="checkbox" id="selectAllAbvrs">
            <label for="selectAllAbvrs"><strong>Select All ABVRs</strong></label>
        </div>
        <div class="abvr-section">
            <h4>ABVRs from Selected Cohorts</h4>
            <div class="abvr-list">
                ${cohortAbvrs.length > 0 ? cohortAbvrs.map(abvr => `
                    <div class="abvr-item cohort-abvr">
                        <input type="checkbox" class="abvr-checkbox" value="${abvr.abvr}" checked>
                        <div class="abvr-content">
                            <div class="abvr-name">${abvr.name}</div>
                            <div class="abvr-description">${abvr.description}</div>
                            <div class="abvr-source">Source: Selected Cohorts</div>
                            <div class="abvr-code">ABVR: ${abvr.abvr}</div>
                        </div>
                    </div>
                `).join('') : '<div class="no-abvrs">No ABVRs available from selected cohorts</div>'}
            </div>
        </div>
        <div class="abvr-section">
            <h4>Selected ABVRs (Recommended)</h4>
            <div class="abvr-list">
                ${abvrs.map(abvr => `
                    <div class="abvr-item">
                        <input type="checkbox" class="abvr-checkbox" value="${abvr.abvr}" checked>
                        <div class="abvr-content">
                            <div class="abvr-name">${abvr.name}</div>
                            <div class="abvr-description">${abvr.description}</div>
                            <div class="abvr-similarity">Similarity: ${(abvr.similarity * 100).toFixed(1)}%</div>
                            <div class="abvr-code">ABVR: ${abvr.abvr}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="abvr-section">
            <h4>Additional ABVRs</h4>
            <div class="abvr-list">
                ${leftAbvrs.map(abvr => `
                    <div class="abvr-item">
                        <input type="checkbox" class="abvr-checkbox" value="${abvr.abvr}">
                        <div class="abvr-content">
                            <div class="abvr-name">${abvr.name}</div>
                            <div class="abvr-description">${abvr.description}</div>
                            <div class="abvr-similarity">Similarity: ${(abvr.similarity * 100).toFixed(1)}%</div>
                            <div class="abvr-code">ABVR: ${abvr.abvr}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Add event listeners for "Select All" checkboxes
    setupSelectAllCheckbox('selectAllCohorts', 'cohort-checkbox');
    setupSelectAllCheckbox('selectAllLocations', 'location-checkbox');
    setupSelectAllCheckbox('selectAllPresets', 'preset-checkbox');
    setupSelectAllCheckbox('selectAllKeywords', 'keyword-checkbox');
    setupSelectAllCheckbox('selectAllAbvrs', 'abvr-checkbox');
    
    // Setup cohort search functionality
    setupCohortSearch();
}

function setupSelectAllCheckbox(selectAllId, checkboxClass) {
    const selectAllCheckbox = document.getElementById(selectAllId);
    const checkboxes = document.querySelectorAll('.' + checkboxClass);
    
    // Add event listener for "Select All" checkbox
    selectAllCheckbox.addEventListener('change', function() {
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
    });
    
    // Add event listeners for individual checkboxes
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const checkedCheckboxes = document.querySelectorAll('.' + checkboxClass + ':checked');
            
            if (checkedCheckboxes.length === checkboxes.length) {
                selectAllCheckbox.checked = true;
            } else {
                selectAllCheckbox.checked = false;
            }
        });
    });
}

function getPresetNameFromForecastResponse(forecastResponse) {
    const preset_display_text={
        "TIL": "TIL_All_Cluster_RNF",
        "TOI": "TIL_TOI_Only_RNF",
        "ET": "TIL_ET_Only_RNF",
        "TOI+ET": "TIL_ET_And_TOI_RNF",
        "NBT": "TIL_NBT_Only_RNF",
        "Maharashtra Times": "TIL_MT_Only_RNF",
        "Vijay Karnataka": "TIL_VK_Only_RNF",
        "IAG": "TIL_IAG_Only_RNF",
        "EI Samay": "TIL_EIS_Only_RNF",
        "Tamil": "TIL_Tamil_Only_RNF",
        "Telugu": "TIL_Telugu_Only_RNF",
        "Malayalam": "TIL_Malayalam_Only_RNF",
        "All Languages": "TIL_All_Languages_RNF"
    }
    response={}
    for (const [key, value] of Object.entries(forecastResponse)) {
        if (preset_display_text[key]) {
            response[preset_display_text[key]] = value;
        }
    }
    return response;
}

async function getForecast() {
    if (!currentData) return;
    
    const forecastResults = document.getElementById('forecastResults');
    const getForecastBtn = document.getElementById('getForecastBtn');
    
    // Change button text and disable it
    const originalText = getForecastBtn.textContent;
    getForecastBtn.textContent = 'Getting Forecast...';
    getForecastBtn.disabled = true;
    
    // Get selected Cohorts
    const selectedCohorts = Array.from(document.querySelectorAll('.cohort-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    // Get selected Locations (by index)
    const selectedLocationIndices = Array.from(document.querySelectorAll('.location-checkbox:checked'))
        .map(checkbox => parseInt(checkbox.value));
    const selectedLocations = selectedLocationIndices.map(index => currentData.locations[index]);
    
    // Get selected Presets
    const selectedPresets = Array.from(document.querySelectorAll('.preset-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    // Get selected Keywords
    const selectedKeywords = Array.from(document.querySelectorAll('.keyword-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    // Get selected ABVRs
    const selectedAbvrs = Array.from(document.querySelectorAll('.abvr-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    if (selectedLocations.length === 0) {
        showErrorToast('Missing Locations', 'Please select at least one location.');
        // Restore button
        getForecastBtn.textContent = originalText;
        getForecastBtn.disabled = false;
        return;
    }
    
    if (selectedPresets.length === 0) {
        showErrorToast('Missing Presets', 'Please select at least one preset.');
        // Restore button
        getForecastBtn.textContent = originalText;
        getForecastBtn.disabled = false;
        return;
    }
    
    if (selectedKeywords.length === 0) {
        showErrorToast('Missing Keywords', 'Please select at least one keyword.');
        // Restore button
        getForecastBtn.textContent = originalText;
        getForecastBtn.disabled = false;
        return;
    }
    
    // Get form values
    const creativeSize = document.getElementById('creativeSize').value;
    const deviceCategory = document.getElementById('deviceCategory').value;
    const targetGender = document.getElementById('targetGender').value;
    const targetAge = Array.from(document.querySelectorAll('.age-checkbox:checked'))
        .map(checkbox => checkbox.value);
    const duration = parseInt(document.getElementById('duration').value);
    
    // Clear previous results
    forecastResults.innerHTML = '';
    
    try {
        const response = await fetch('/get-forecast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cohorts: selectedCohorts,
                locations: selectedLocations,
                preset: selectedPresets,
                creative_size: creativeSize,
                device_category: deviceCategory,
                target_gender: targetGender,
                target_age: targetAge,
                duration: duration,
                abvrs: selectedAbvrs
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayForecastResults(data);
        } else {
            showErrorToast('Forecast Error', data.detail || 'An error occurred');
        }
    } catch (err) {
        console.error('Error details:', err);
        showErrorToast('Forecast Error', 'An error occurred while getting forecast: ' + err.message);
    } finally {
        getForecastBtn.textContent = originalText;
        getForecastBtn.disabled = false;
    }
}

function displayForecastResults(forecastData) {
    const forecastResults = document.getElementById('forecastResults');
    
    // Store the forecast data globally for CSV download
    currentForecastData = forecastData;
    
    if (forecastData && typeof forecastData === 'object') {
        // Show the download button
        const downloadBtn = document.getElementById('downloadCsvBtn');
        if (downloadBtn) {
            downloadBtn.style.display = 'inline-block';
        }
        
        // Show the presentation button
        const presentationBtn = document.getElementById('createPresentationBtn');
        if (presentationBtn) {
            presentationBtn.style.display = 'inline-block';
        }
        
        for (const [preset, locations] of Object.entries(forecastData)) {
            const presetSection = document.createElement('div');
            presetSection.className = 'preset-section';
            
            const presetTitle = document.createElement('div');
            presetTitle.className = 'preset-title';
            presetTitle.textContent = preset;
            presetSection.appendChild(presetTitle);
            
            const table = document.createElement('table');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Location</th>
                        <th>User Reach</th>
                        <th>Impressions</th>
                    </tr>
                </thead>
                <tbody>
                </tbody>
            `;
            
            const tbody = table.querySelector('tbody');
            
            for (const [location, metrics] of Object.entries(locations)) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${location}</td>
                    <td>${metrics.user.toFixed(2)}</td>
                    <td>${metrics.impr.toFixed(2)}</td>
                `;
                tbody.appendChild(row);
            }
            
            presetSection.appendChild(table);
            forecastResults.appendChild(presetSection);
        }
    } else {
        forecastResults.innerHTML = '<div class="error">No forecast data found</div>';
        // Hide the download button if no data
        const downloadBtn = document.getElementById('downloadCsvBtn');
        if (downloadBtn) {
            downloadBtn.style.display = 'none';
        }
        
        // Hide the presentation button if no data
        const presentationBtn = document.getElementById('createPresentationBtn');
        if (presentationBtn) {
            presentationBtn.style.display = 'none';
        }
    }
}

async function createPresentation() {
    if (!currentForecastData || !currentData) {
        showErrorToast('No Data', 'No forecast data available for presentation.');
        return;
    }
    
    // Get selected ABVRs
    const selectedAbvrs = Array.from(document.querySelectorAll('.abvr-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    if (selectedAbvrs.length === 0) {
        showErrorToast('No ABVRs Selected', 'Please select at least one ABVR for the presentation.');
        return;
    }
    
    const createPresentationBtn = document.getElementById('createPresentationBtn');
    const originalText = createPresentationBtn.textContent;
    createPresentationBtn.textContent = 'Creating Presentation...';
    createPresentationBtn.disabled = true;
    
    const oldSlidesLink = document.querySelector('.slides-link-container');
    if (oldSlidesLink) oldSlidesLink.remove();

    try {
        const response = await fetch(`${API_CONFIG.presentation_api_url}/generate-presentation-from-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email_subject: document.getElementById('subject').value,
                email_body: document.getElementById('body').value,
                abvrs: selectedAbvrs.join(','),
                forecast_data: getPresetNameFromForecastResponse(currentForecastData)
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.status === 'success') {
            showSuccessToast('Presentation Created', data.message || 'Presentation has been created successfully!');
            
            // Display the Google Slides URL
            if (data.google_slides_url) {
                // Create a clickable link to open the Google Slides
                const slidesLink = document.createElement('div');
                slidesLink.className = 'slides-link-container';
                slidesLink.innerHTML = `
                    <div class="slides-link-content">
                        <h4>📊 Presentation Generated Successfully!</h4>
                        <a href="${data.google_slides_url}" target="_blank" class="slides-link-btn">
                            🎯 Open Google Slides Presentation
                        </a>
                        <p class="slides-link-note">Click the button above to view your presentation in Google Slides</p>
                    </div>
                `;
                
                // Add the link to the forecast results section
                const forecastResults = document.getElementById('forecastResults');
                forecastResults.appendChild(slidesLink);
                
                // Show info toast with the link
                showInfoToast('Google Slides Ready', `Your presentation is ready! Click the link above to view it.`);
            } else {
                showInfoToast('Presentation Status', data.message || 'Presentation created but no link provided.');
            }
        } else {
            const errorMessage = data.error || data.detail || 'An error occurred while creating the presentation.';
            showErrorToast('Presentation Error', errorMessage);
        }
    } catch (err) {
        console.error('Error creating presentation:', err);
        showErrorToast('Presentation Error', 'An error occurred while creating the presentation: ' + err.message);
    } finally {
        createPresentationBtn.textContent = originalText;
        createPresentationBtn.disabled = false;
    }
}

function downloadForecastCsv() {
    if (!currentForecastData || !currentData) {
        showErrorToast('No Data', 'No forecast data available for download.');
        return;
    }
    
    // Get selected ABVRs
    const selectedAbvrs = Array.from(document.querySelectorAll('.abvr-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    // Get duration
    const duration = parseInt(document.getElementById('duration').value) || 30;
    
    // Generate CSV content
    const csvContent = generateForecastCsv(currentForecastData, selectedAbvrs, duration);
    
    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `forecast_data_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showSuccessToast('Download Complete', 'CSV file downloaded successfully!');
}

function generateForecastCsv(forecastData, selectedAbvrs, duration) {
    const csvRows = [];

    // Combine abvr data
    const allAbvrs = [...(currentData.abvrs || []), ...(currentData.left_abvrs || [])];
    
    // Add cohort ABVRs to the mix
    const cohortAbvrs = Object.entries(abvrsSelectedFromCohorts).map(([abvrCode, abvrData]) => ({
        abvr: abvrCode,
        name: abvrData.name,
        description: abvrData.description,
        similarity: 1.0,
    }));
    
    const allAbvrsWithCohorts = [...allAbvrs, ...cohortAbvrs];
    const selectedAbvrDetails = allAbvrsWithCohorts.filter(abvr => selectedAbvrs.includes(abvr.abvr));

    const forecastRows = [];

    // Build forecast data rows
    for (const [preset, locations] of Object.entries(forecastData)) {
        // Preset name row
        forecastRows.push([`${preset} (${duration} days)`, '', '', '', '', '']);

        // Headers
        forecastRows.push(['Geo', 'User Reach (Mn)F-Cap-1/Lifetime', 'Targettable Impression(Mn)F-Cap-3/Day', '', '', '']);

        // Location data
        for (const [location, metrics] of Object.entries(locations)) {
            forecastRows.push([
                location,
                metrics.user.toFixed(2),
                metrics.impr.toFixed(2),
                '',
                '',
                ''
            ]);
        }
        forecastRows.push(['', '', '', '', '', '']);
    }

    // Build audience data rows
    const abvrRows = [];
    abvrRows.push(['', '', '', 'Name', 'Description']);
    selectedAbvrDetails.forEach(abvr => {
        abvrRows.push(['', '', '', abvr.name || abvr.abvr, abvr.description || '']);
    });

    // Merge forecast and abvr rows side by side
    csvRows.push(['', '', '', '', '', '']);
    const maxRows = Math.max(forecastRows.length, abvrRows.length);
    for (let i = 0; i < maxRows; i++) {
        const forecastRow = forecastRows[i] || ['', '', '', '', '', ''];
        const abvrRow = abvrRows[i] || ['', '', '', '', ''];
        const mergedRow = [
            forecastRow[0] || '',
            forecastRow[1] || '',
            forecastRow[2] || '',
            '', // blank 4th column
            abvrRow[3] || '',
            abvrRow[4] || ''
        ];
        csvRows.push(mergedRow);
    }

    // Convert to CSV string
    return csvRows.map(row =>
        row.map(cell => {
            const escaped = String(cell).replace(/"/g, '""');
            if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
                return `"${escaped}"`;
            }
            return escaped;
        }).join(',')
    ).join('\n');
}

function addNewKeyword() {
    const keywordInput = document.getElementById('keywordInput');
    const keywordToAdd = keywordInput.value.trim();
    
    if (!keywordToAdd) {
        showErrorToast('Missing Keyword', 'Please enter a keyword to add.');
        return;
    }
    
    // Initialize keywords array if it doesn't exist
    if (!currentData.keywords) {
        currentData.keywords = [];
    }
    
    // Check if already selected
    if (currentData.keywords.includes(keywordToAdd)) {
        showErrorToast('Already Selected', `Keyword "${keywordToAdd}" is already selected.`);
        return;
    }
    
    // Add the keyword
    currentData.keywords.push(keywordToAdd);
    
    // Refresh the display
    displayEditableForm(currentData);
    
    // Re-render chips after form refresh
    renderIncludedLocationChips();
    renderExcludedLocationChips();
    
    // Clear the input
    keywordInput.value = '';
    
    // Show success message
    showSuccessToast('Keyword Added', `Added "${keywordToAdd}" to the selection.`);
}

function renderIncludedLocationChips() {
    const container = document.getElementById('includedLocationsChips');
    if (!container) return;
    
    container.innerHTML = includedLocationChips.map((chip, idx) =>
        `<span class="chip${chip.type === 'group' ? ' location-group-chip' : ''}">${chip.type === 'group' ? '🏢 ' : ''}${chip.name}<button class="remove-chip" onclick="removeIncludedLocationChip(${idx})">&times;</button></span>`
    ).join('') + '<input type="text" class="chips-input" id="includedLocationInput" placeholder="Type to search locations..." autocomplete="off">';
    
    setupIncludedLocationInput();
}

function renderExcludedLocationChips() {
    const container = document.getElementById('excludedLocationsChips');
    if (!container) return;
    
    container.innerHTML = excludedLocationChips.map((chip, idx) =>
        `<span class="chip">${chip.name}<button class="remove-chip" onclick="removeExcludedLocationChip(${idx})">&times;</button></span>`
    ).join('') + '<input type="text" class="chips-input" id="excludedLocationInput" placeholder="Type to search locations..." autocomplete="off">';
    
    setupExcludedLocationInput();
}

function removeIncludedLocationChip(idx) {
    const removedChip = includedLocationChips[idx];
    includedLocationChips.splice(idx, 1);
    renderIncludedLocationChips();
    
    // If the removed chip was a group, re-enable the nameAsId input and excluded location input
    if (removedChip && removedChip.type === 'group') {
        const nameAsIdInput = document.getElementById('nameAsIdInput');
        const excludedLocationInput = document.getElementById('excludedLocationInput');
        
        if (nameAsIdInput) {
            nameAsIdInput.disabled = false;
            nameAsIdInput.value = '';
        }
        
        if (excludedLocationInput) {
            excludedLocationInput.disabled = false;
        }
    }
}

function removeExcludedLocationChip(idx) {
    excludedLocationChips.splice(idx, 1);
    renderExcludedLocationChips();
}

function setupIncludedLocationInput() {
    const input = document.getElementById('includedLocationInput');
    if (!input) {
        return;
    }
    
    // Remove existing event listeners to prevent duplication
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        locationHighlightedIndex = -1;
        
        if (searchTerm.length === 0) {
            hideLocationDropdown();
            return;
        }
        
        // Combine locations and location groups for search
        const allOptions = [
            ...availableLocations.map(loc => ({ name: loc.name, id: loc.id })),
            ...Object.keys(availableLocationGroups).map(groupName => ({ 
                name: groupName, 
                type: 'group',
                groupData: availableLocationGroups[groupName]
            }))
        ];
        
        if (allOptions.length === 0) {
            return;
        }
        
        const matchingOptions = allOptions.filter(option =>
            option.name.toLowerCase().includes(searchTerm) && 
            !includedLocationChips.some(chip => chip.name === option.name)
        );
        
        showLocationDropdown(matchingOptions, searchTerm, 'included');
    });
    
    newInput.addEventListener('keydown', function(e) {
        const dropdown = document.getElementById('includedLocationSearchDropdown');
        if (!dropdown) return;
        
        const dropdownItems = dropdown.querySelectorAll('.search-dropdown-item:not(.no-results)');
        const matchingOptions = dropdown._matchingOptions || [];
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            locationHighlightedIndex = Math.min(locationHighlightedIndex + 1, dropdownItems.length - 1);
            updateLocationHighlight(dropdownItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            locationHighlightedIndex = Math.max(locationHighlightedIndex - 1, -1);
            updateLocationHighlight(dropdownItems);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (locationHighlightedIndex >= 0 && dropdownItems[locationHighlightedIndex]) {
                // Use the matchingOptions array
                selectIncludedLocationFromDropdown(matchingOptions[locationHighlightedIndex]);
            } else if (this.value.trim()) {
                selectIncludedLocationFromDropdown({ name: this.value.trim(), type: 'location' });
            }
        } else if (e.key === 'Escape') {
            hideLocationDropdown();
        }
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('includedLocationSearchDropdown');
        if (!newInput.contains(e.target) && !dropdown.contains(e.target)) {
            hideLocationDropdown();
        }
    });
}

function setupExcludedLocationInput() {
    const input = document.getElementById('excludedLocationInput');
    if (!input) {
        return;
    }
    
    // Remove existing event listeners to prevent duplication
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        excludedLocationHighlightedIndex = -1;
        
        if (searchTerm.length === 0) {
            hideExcludedLocationDropdown();
            return;
        }
        
        if (!availableLocations || availableLocations.length === 0) {
            return;
        }
        
        const matchingLocations = availableLocations.filter(location =>
            location.name.toLowerCase().includes(searchTerm) && 
            !excludedLocationChips.some(chip => chip.name === location.name)
        );
        
        showExcludedLocationDropdown(matchingLocations, searchTerm);
    });
    
    newInput.addEventListener('keydown', function(e) {
        const dropdown = document.getElementById('excludedLocationSearchDropdown');
        if (!dropdown) return;
        
        const dropdownItems = dropdown.querySelectorAll('.search-dropdown-item:not(.no-results)');
        const matchingLocations = dropdown._matchingLocations || [];
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            excludedLocationHighlightedIndex = Math.min(excludedLocationHighlightedIndex + 1, dropdownItems.length - 1);
            updateExcludedLocationHighlight(dropdownItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            excludedLocationHighlightedIndex = Math.max(excludedLocationHighlightedIndex - 1, -1);
            updateExcludedLocationHighlight(dropdownItems);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (excludedLocationHighlightedIndex >= 0 && dropdownItems[excludedLocationHighlightedIndex]) {
                selectExcludedLocationFromDropdown(matchingLocations[excludedLocationHighlightedIndex]);
            } else if (this.value.trim()) {
                selectExcludedLocationFromDropdown({ name: this.value.trim(), type: 'location' });
            }
        } else if (e.key === 'Escape') {
            hideExcludedLocationDropdown();
        }
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('excludedLocationSearchDropdown');
        if (!newInput.contains(e.target) && !dropdown.contains(e.target)) {
            hideExcludedLocationDropdown();
        }
    });
}

function addNewLocation() {
    const nameAsIdInput = document.getElementById('nameAsIdInput');
    const includedLocations = includedLocationChips.filter(chip => chip.type !== 'group').map(chip => chip.name);
    const excludedLocations = excludedLocationChips.map(chip => chip.name);
    const groupChip = includedLocationChips.find(chip => chip.type === 'group');
    let nameAsId = nameAsIdInput ? nameAsIdInput.value.trim() : '';
    
    // If a group is selected, excluded locations must be empty and nameAsId is group name
    if (groupChip) {
        if (excludedLocations.length > 0) {
            showErrorToast('Invalid Selection', 'Cannot add excluded locations when a location group is selected.');
            return;
        }
        nameAsId = groupChip.name;
    }
    
    // Validation: Check if included locations count is not 1 and excluded locations count is non-zero and nameAsId is empty
    if (includedLocations.length !== 1 && excludedLocations.length > 0 && !nameAsId) {
        showErrorToast('Missing Name as ID', 'When you have multiple included locations or excluded locations, you must provide a Name as ID.');
        return;
    }
    
    // Allow both included and excluded to be empty only if nameAsId is provided
    if (includedLocations.length === 0 && excludedLocations.length === 0 && !nameAsId) {
        showErrorToast('Missing Locations', 'Please enter at least one included or excluded location, or provide a Name as ID.');
        return;
    }
    
    if (!currentData.locations) {
        currentData.locations = [];
    }
    
    let newLocation;
    
    if (groupChip) {
        // For location groups, use the group data structure
        newLocation = {
            includedLocations: groupChip.groupData.includedLocations,
            excludedLocations: groupChip.groupData.excludedLocations,
            nameAsId: groupChip.groupData.nameAsId
        };
    } else {
        // Convert location names to objects with name and id
        const includedLocationsFormatted = includedLocations.map(locName => {
            const foundLocation = availableLocations.find(loc => loc.name === locName);
            return foundLocation || { name: locName, id: null };
        });
        
        const excludedLocationsFormatted = excludedLocations.map(locName => {
            const foundLocation = availableLocations.find(loc => loc.name === locName);
            return foundLocation || { name: locName, id: null };
        });
        
        newLocation = {
            includedLocations: includedLocationsFormatted,
            excludedLocations: excludedLocationsFormatted,
            nameAsId: nameAsId
        };
    }
    
    const existingLocation = currentData.locations.find(loc => {
        const locIncluded = Array.isArray(loc.includedLocations) ? loc.includedLocations.map(l => typeof l === 'string' ? l : l.name).join(' | ') : '';
        const locExcluded = Array.isArray(loc.excludedLocations) ? loc.excludedLocations.map(l => typeof l === 'string' ? l : l.name).join(' | ') : '';
        const newIncluded = Array.isArray(newLocation.includedLocations) ? newLocation.includedLocations.map(l => typeof l === 'string' ? l : l.name).join(' | ') : '';
        const newExcluded = Array.isArray(newLocation.excludedLocations) ? newLocation.excludedLocations.map(l => typeof l === 'string' ? l : l.name).join(' | ') : '';
        
        return locIncluded === newIncluded && locExcluded === newExcluded && loc.nameAsId === newLocation.nameAsId;
    });
    
    if (existingLocation) {
        showErrorToast('Already Added', 'This location combination is already added.');
        return;
    }
    
    currentData.locations.push(newLocation);
    displayEditableForm(currentData);
    
    // Clear chips and inputs
    includedLocationChips = [];
    excludedLocationChips = [];
    renderIncludedLocationChips();
    renderExcludedLocationChips();
    
    if (nameAsIdInput) nameAsIdInput.value = '';
    
    showSuccessToast('Location Added', 'Location added successfully!');
}

function addNewPreset() {
    const presetInput = document.getElementById('presetInput');
    const presetToAdd = presetInput.value.trim();
    
    if (!presetToAdd) {
        showErrorToast('Missing Preset', 'Please enter a preset to add.');
        return;
    }
    
    // Initialize preset array if it doesn't exist
    if (!currentData.preset) {
        currentData.preset = [];
    }
    
    // Check if already selected
    if (currentData.preset.includes(presetToAdd)) {
        showErrorToast('Already Selected', `Preset "${presetToAdd}" is already selected.`);
        return;
    }
    
    // Add the preset
    currentData.preset.push(presetToAdd);
    
    // Refresh the display
    displayEditableForm(currentData);
    
    // Re-render chips after form refresh
    renderIncludedLocationChips();
    renderExcludedLocationChips();
    
    // Clear the input
    presetInput.value = '';
    
    // Show success message
    showSuccessToast('Preset Added', `Added "${presetToAdd}" to the selection.`);
}

async function getAbvrsFromKeywords() {
    // Get selected keywords
    const selectedKeywords = Array.from(document.querySelectorAll('.keyword-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    if (selectedKeywords.length === 0) {
        showErrorToast('Missing Keywords', 'Please select at least one keyword to get ABVRs.');
        return;
    }
    
    const getAbvrsFromKeywordsBtn = document.getElementById('getAbvrsFromKeywordsBtn');
    const addKeywordBtn = document.getElementById('addKeywordBtn');
    const originalTextForGetAbvrsFromKeywordsBtn = getAbvrsFromKeywordsBtn.textContent;
    getAbvrsFromKeywordsBtn.textContent = 'Getting ABVRs...';
    getAbvrsFromKeywordsBtn.disabled = true;
    addKeywordBtn.disabled = true;

    const selectedCohorts = Array.from(document.querySelectorAll('.cohort-checkbox:checked'))
    .map(checkbox => checkbox.value);
    
    try {
        const response = await fetch('/get-abvrs-from-keywords', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({keywords: selectedKeywords, cohorts: selectedCohorts})
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Update the current data with new ABVRs
            currentData.keywords = data.keywords || [];
            currentData.abvrs = data.abvrs || [];
            currentData.left_abvrs = data.left_abvrs || [];
            
            // Refresh the display
            displayEditableForm(currentData);
            
            // Re-render chips after form refresh
            renderIncludedLocationChips();
            renderExcludedLocationChips();
            
            // Show success message
            showSuccessToast('ABVRs Updated', `Updated ABVRs based on ${selectedKeywords.length} selected keywords.`);
        } else {
            showErrorToast('ABVR Error', data.detail || 'An error occurred while getting ABVRs from keywords.');
        }
    } catch (err) {
        console.error('Error details:', err);
        showErrorToast('ABVR Error', 'An error occurred while getting ABVRs from keywords: ' + err.message);
    } finally {
        getAbvrsFromKeywordsBtn.textContent = originalTextForGetAbvrsFromKeywordsBtn;
        getAbvrsFromKeywordsBtn.disabled = false;
        addKeywordBtn.disabled = false;
    }
}

async function addSelectedABVR() {
    const abvrSearchInput = document.getElementById('abvrSearch');
    const abvrsToAdd = abvrSearchInput.value.trim();
    
    if (!abvrsToAdd) {
        showErrorToast('Missing ABVRs', 'Please enter ABVRs to add (comma-separated).');
        return;
    }
    
    const addSelectedABVRBtn = document.getElementById('addSelectedABVRBtn');
    const originalTextForAddSelectedABVRBtn = addSelectedABVRBtn.textContent;
    addSelectedABVRBtn.textContent = 'Adding ABVRs...';
    addSelectedABVRBtn.disabled = true;
    
    try {
        const response = await fetch('/get-audience-segment-by-abvrs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ abvrs: abvrsToAdd })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Add the new ABVRs to the left_abvrs section
            if (!currentData.left_abvrs) {
                currentData.left_abvrs = [];
            }
            
            // Check for duplicates and add new ones
            let addedCount = 0;
            let abvrsToRemove = [];
            data.forEach(newAbvr => {
                const isDuplicateDefaultSelected = currentData.abvrs.some(existing => existing.abvr === newAbvr.abvr);
                const existingInLeftAbvrs = currentData.left_abvrs.find(existing => existing.abvr === newAbvr.abvr);
                
                if (!isDuplicateDefaultSelected && !existingInLeftAbvrs) {
                    currentData.abvrs.push(newAbvr);
                    addedCount++;
                } else if (existingInLeftAbvrs) {
                    currentData.abvrs.push(existingInLeftAbvrs);
                    abvrsToRemove.push(existingInLeftAbvrs.abvr);
                    addedCount++;
                }
            });
            currentData.left_abvrs = currentData.left_abvrs.filter(abvr => !abvrsToRemove.includes(abvr.abvr));
            // Refresh the display
            displayEditableForm(currentData);
            
            // Re-render chips after form refresh
            renderIncludedLocationChips();
            renderExcludedLocationChips();
            
            // Clear the input
            abvrSearchInput.value = '';
            
            // Show success message
            if (addedCount > 0) {
                showSuccessToast('ABVRs Added', `Added ${addedCount} new audience segment(s) to the selection.`);
            } else {
                showSuccessToast('No New ABVRs', 'All ABVRs are already in the selection.');
            }
        } else {
            showErrorToast('ABVR Error', data.detail || 'An error occurred while getting audience segments.');
        }
    } catch (err) {
        console.error('Error details:', err);
        showErrorToast('ABVR Error', 'An error occurred while getting audience segments: ' + err.message);
    } finally {
        addSelectedABVRBtn.textContent = originalTextForAddSelectedABVRBtn;
        addSelectedABVRBtn.disabled = false;
    }
}

// Function to update age selected display
function updateAgeSelectedDisplay() {
    const selectedAges = Array.from(document.querySelectorAll('.age-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    const displayElement = document.getElementById('ageSelectedDisplay');
    if (displayElement) {
        if (selectedAges.length === 0) {
            displayElement.textContent = 'None';
        } else if (selectedAges.includes('All')) {
            displayElement.textContent = 'All Ages';
        } else {
            displayElement.textContent = selectedAges.join(', ');
        }
    }
}

// Add event listener for Enter key in keyword input
document.addEventListener('DOMContentLoaded', function() {
    const keywordInput = document.getElementById('keywordInput');
    if (keywordInput) {
        keywordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addNewKeyword();
            }
        });
    }
    
    const nameAsIdInput = document.getElementById('nameAsIdInput');
    if (nameAsIdInput) {
        nameAsIdInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addNewLocation();
            }
        });
    }
    
    const presetInput = document.getElementById('presetInput');
    if (presetInput) {
        presetInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addNewPreset();
            }
        });
    }
    
    // Add event listeners for age checkboxes
    const ageCheckboxes = document.querySelectorAll('.age-checkbox');
    ageCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            // If "All" is selected, uncheck others
            if (this.value === 'All' && this.checked) {
                ageCheckboxes.forEach(cb => {
                    if (cb !== this) {
                        cb.checked = false;
                    }
                });
            }
            // If other options are selected, uncheck "All"
            else if (this.value !== 'All' && this.checked) {
                const allCheckbox = document.querySelector('.age-checkbox[value="All"]');
                if (allCheckbox) {
                    allCheckbox.checked = false;
                }
            }
            
            updateAgeSelectedDisplay();
        });
    });
});
// Locations Not Found Functions
function displayLocationsNotFound(locationsNotFound) {
    const section = document.getElementById('locationsNotFoundSection');
    const list = document.getElementById('locationsNotFoundList');
    
    if (!section || !list) return;
    
    // Clear previous content
    list.innerHTML = '';
    
    // Create items for each location not found
    locationsNotFound.forEach(location => {
        const item = document.createElement('div');
        item.className = 'location-not-found-item';
        item.innerHTML = `
            <span class="location-not-found-name">${location}</span>
            <button class="add-to-db-btn" onclick="openAddLocationModal('${location}')">
                Add to DB
            </button>
        `;
        list.appendChild(item);
    });
    
    // Show the section
    section.style.display = 'block';
}

function openAddLocationModal(locationName) {
    modalIncludedLocations = [];
    modalExcludedLocations = [];
    modalSingleLocation = null;
    
    // Reset toggle to single location mode (default)
    document.getElementById('locationModeToggle').checked = true;
    toggleLocationMode();
    
    // Clear other fields
    document.getElementById('modalIncludedLocationSearch').value = '';
    document.getElementById('modalExcludedLocationSearch').value = '';
    document.getElementById('modalNameAsId').value = locationName;
    document.getElementById('modalSingleLocationSearch').value = '';
    
    // Clear chips
    renderModalIncludedLocationChips();
    renderModalExcludedLocationChips();
    renderModalSingleLocationChip();
    
    // Setup search functionality
    setupModalLocationSearch();
    
    // Show the modal
    document.getElementById('addLocationModal').style.display = 'block';
}

function closeAddLocationModal() {
    document.getElementById('addLocationModal').style.display = 'none';
    modalIncludedLocations = [];
    modalExcludedLocations = [];
    modalSingleLocation = null;
}

function toggleLocationMode() {
    const toggle = document.getElementById('locationModeToggle');
    const singleSection = document.getElementById('singleLocationSection');
    const groupSection = document.getElementById('locationGroupSection');
    const modalTitle = document.getElementById('modalTitle');
    const saveButton = document.getElementById('modalSaveButton');
    const toggleText = document.querySelector('.toggle-text');
    
    console.log('toggleLocationMode called, toggle.checked:', toggle.checked);
    
    if (toggle.checked) {
        // Single location mode
        singleSection.style.display = 'block';
        groupSection.style.display = 'none';
        modalTitle.textContent = 'Add Single Location to Database';
        saveButton.textContent = 'Save Single Location';
        toggleText.textContent = 'Single Location';
        console.log('Switched to single location mode');
    } else {
        // Location group mode
        singleSection.style.display = 'none';
        groupSection.style.display = 'block';
        modalTitle.textContent = 'Add Location Group to Database';
        saveButton.textContent = 'Save Location Group';
        toggleText.textContent = 'Location Group';
        console.log('Switched to location group mode');
    }
}

function setupModalLocationSearch() {
    const includedSearchInput = document.getElementById('modalIncludedLocationSearch');
    const excludedSearchInput = document.getElementById('modalExcludedLocationSearch');
    const singleLocationSearchInput = document.getElementById('modalSingleLocationSearch');
    const includedDropdown = document.getElementById('modalIncludedLocationDropdown');
    const excludedDropdown = document.getElementById('modalExcludedLocationDropdown');
    const singleLocationDropdown = document.getElementById('modalSingleLocationDropdown');
    
    // Setup single location search
    singleLocationSearchInput.addEventListener('input', async function() {
        const searchTerm = this.value.trim();
        if (searchTerm.length === 0) {
            singleLocationDropdown.style.display = 'none';
            return;
        }
        
        try {
            const response = await fetch(`${API_CONFIG.locations_api_url}/location/${encodeURIComponent(searchTerm)}`);
            const matchingLocations = await response.json();
            
            showModalSingleLocationDropdown(matchingLocations, singleLocationDropdown);
        } catch (error) {
            console.error('Error searching single locations:', error);
            singleLocationDropdown.innerHTML = '<div class="no-results">Error searching locations</div>';
            singleLocationDropdown.style.display = 'block';
        }
    });
    
    // Setup included locations search
    includedSearchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        if (searchTerm.length === 0) {
            includedDropdown.style.display = 'none';
            return;
        }
        
        const matchingLocations = availableLocations.filter(location => 
            location.name.toLowerCase().includes(searchTerm) &&
            !modalIncludedLocations.some(selected => selected.id === location.id)
        );
        
        showModalLocationDropdown(matchingLocations, includedDropdown, 'included');
    });
    
    // Setup excluded locations search
    excludedSearchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        if (searchTerm.length === 0) {
            excludedDropdown.style.display = 'none';
            return;
        }
        
        const matchingLocations = availableLocations.filter(location => 
            location.name.toLowerCase().includes(searchTerm) &&
            !modalExcludedLocations.some(selected => selected.id === location.id)
        );
        
        showModalLocationDropdown(matchingLocations, excludedDropdown, 'excluded');
    });
    
    // Hide dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!includedSearchInput.contains(e.target) && !includedDropdown.contains(e.target)) {
            includedDropdown.style.display = 'none';
        }
        if (!excludedSearchInput.contains(e.target) && !excludedDropdown.contains(e.target)) {
            excludedDropdown.style.display = 'none';
        }
        if (!singleLocationSearchInput.contains(e.target) && !singleLocationDropdown.contains(e.target)) {
            singleLocationDropdown.style.display = 'none';
        }
    });
}

function showModalLocationDropdown(matchingLocations, dropdown, type) {
    if (matchingLocations.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching locations found</div>';
    } else {
        dropdown.innerHTML = matchingLocations.map((location, idx) => 
            `<div class="search-dropdown-item" data-idx="${idx}">${location.name}</div>`
        ).join('');
        
        // Add click event listeners
        const items = dropdown.querySelectorAll('.search-dropdown-item');
        items.forEach((item, idx) => {
            item.addEventListener('click', function() {
                selectModalLocation(matchingLocations[idx], type);
            });
        });
    }
    
    dropdown.style.display = 'block';
}

function showModalSingleLocationDropdown(matchingLocations, dropdown) {
    if (matchingLocations.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching locations found</div>';
    } else {
        dropdown.innerHTML = matchingLocations.map((location, idx) => 
            `<div class="search-dropdown-item" data-idx="${idx}">${location.name}</div>`
        ).join('');
        
        // Add click event listeners
        const items = dropdown.querySelectorAll('.search-dropdown-item');
        items.forEach((item, idx) => {
            item.addEventListener('click', function() {
                selectModalSingleLocation(matchingLocations[idx]);
            });
        });
    }
    
    dropdown.style.display = 'block';
}

function selectModalLocation(location, type) {
    if (type === 'included') {
        modalIncludedLocations.push(location);
        document.getElementById('modalIncludedLocationSearch').value = '';
        document.getElementById('modalIncludedLocationDropdown').style.display = 'none';
        renderModalIncludedLocationChips();
    } else {
        modalExcludedLocations.push(location);
        document.getElementById('modalExcludedLocationSearch').value = '';
        document.getElementById('modalExcludedLocationDropdown').style.display = 'none';
        renderModalExcludedLocationChips();
    }
}

function selectModalSingleLocation(location) {
    console.log('selectModalSingleLocation called with:', location);
    const nameParts = location.name.split(",");
    const name = nameParts.slice(0, -1).join(",");
    const id = location.id;
    modalSingleLocation = {name: name, id: id};
    document.getElementById('modalSingleLocationSearch').value = '';
    document.getElementById('modalSingleLocationDropdown').style.display = 'none';
    renderModalSingleLocationChip();
    console.log('modalSingleLocation after selection:', modalSingleLocation);
}

function renderModalIncludedLocationChips() {
    const container = document.getElementById('modalIncludedLocationsChips');
    if (!container) return;
    
    container.innerHTML = '';
    
    modalIncludedLocations.forEach((location, idx) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
            <span>${location.name}</span>
            <span class="remove-chip" onclick="removeModalIncludedLocationChip(${idx})">&times;</span>
        `;
        container.appendChild(chip);
    });
}

function renderModalExcludedLocationChips() {
    const container = document.getElementById('modalExcludedLocationsChips');
    if (!container) return;
    
    container.innerHTML = '';
    
    modalExcludedLocations.forEach((location, idx) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
            <span>${location.name}</span>
            <span class="remove-chip" onclick="removeModalExcludedLocationChip(${idx})">&times;</span>
        `;
        container.appendChild(chip);
    });
}

function renderModalSingleLocationChip() {
    const container = document.getElementById('modalSingleLocationChip');
    if (!container) {
        console.log('modalSingleLocationChip container not found');
        return;
    }
    
    container.innerHTML = '';
    console.log('renderModalSingleLocationChip, modalSingleLocation:', modalSingleLocation);
    
    if (modalSingleLocation) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
            <span>${modalSingleLocation.name}</span>
            <span class="remove-chip" onclick="removeModalSingleLocationChip()">&times;</span>
        `;
        container.appendChild(chip);
        console.log('Single location chip rendered');
    } else {
        console.log('No single location to render');
    }
}

function removeModalSingleLocationChip() {
    modalSingleLocation = null;
    renderModalSingleLocationChip();
}

function removeModalIncludedLocationChip(idx) {
    modalIncludedLocations.splice(idx, 1);
    renderModalIncludedLocationChips();
}

function removeModalExcludedLocationChip(idx) {
    modalExcludedLocations.splice(idx, 1);
    renderModalExcludedLocationChips();
}

async function saveLocation() {
    const toggle = document.getElementById('locationModeToggle');
    const isSingleLocationMode = toggle.checked;
    
    console.log('saveLocation called, isSingleLocationMode:', isSingleLocationMode);
    console.log('modalSingleLocation:', modalSingleLocation);
    
    // Disable the save button
    const saveBtn = document.querySelector('#addLocationModal .btn-primary');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    try {
        if (isSingleLocationMode) {
            console.log('Calling saveSingleLocation');
            await saveSingleLocation();
        } else {
            console.log('Calling saveLocationGroup');
            await saveLocationGroup();
        }
    } catch (err) {
        console.error('Error saving location:', err);
        showErrorToast('Save Error', 'An error occurred while saving the location: ' + err.message);
    } finally {
        // Re-enable the save button
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

async function saveSingleLocation() {
    console.log('saveSingleLocation called, modalSingleLocation:', modalSingleLocation);
    
    if (!modalSingleLocation) {
        showErrorToast('Missing Data', 'Please select a location to save.');
        return;
    }
    
    if (!modalSingleLocation.id || !modalSingleLocation.name) {
        showErrorToast('Invalid Data', 'Selected location is missing required data (id or name).');
        return;
    }
    
    try {
        // Call the API to save single location
        const response = await fetch(`${API_CONFIG.locations_api_url}/locations/${modalSingleLocation.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Close the modal
            const locationSaved = modalSingleLocation;
            availableLocations.push(locationSaved);
            closeAddLocationModal();
            
            // Add the single location to the current selection
            console.log('currentData before adding location:', currentData);
            if (!currentData) {
                console.log('currentData is null, initializing');
                currentData = { locations: [] };
            }
            if (!currentData.locations) {
                currentData.locations = [];
            }
            
            // Add the new single location to the selection
            currentData.locations.push({
                includedLocations: [{"name": locationSaved.name, "id": locationSaved.id}],
                excludedLocations: [],
                nameAsId: ""
            });
            
            // Refresh the display
            console.log('About to call displayEditableForm with:', currentData);
            try {
                displayEditableForm(currentData);
                console.log('displayEditableForm completed successfully');
            } catch (error) {
                console.error('Error in displayEditableForm:', error);
                throw error;
            }
            
            // Re-render chips
            renderIncludedLocationChips();
            renderExcludedLocationChips();
            
            // Remove the location from the not found list
            removeLocationFromNotFoundList(locationSaved.name.split(",").slice(0, -2).join(","));
            
            showSuccessToast('Single Location Added', `Successfully added "${locationSaved.name}" to the database and selection.`);
        } else {
            showErrorToast('Save Error', data.detail || 'Failed to save single location to database.');
        }
    } catch (err) {
        console.error('Error saving single location:', err);
        showErrorToast('Save Error', 'An error occurred while saving the single location: ' + err.message);
    }
}

async function saveLocationGroup() {
    const nameAsId = document.getElementById('modalNameAsId').value.trim();
    console.log("modalIncludedLocations", modalIncludedLocations);
    console.log("modalExcludedLocations", modalExcludedLocations);
    console.log("nameAsId", nameAsId);
    if (modalIncludedLocations.length === 0) {
        showErrorToast('Missing Data', 'Please select at least one included location.');
        return;
    }
    
    if (!nameAsId) {
        showErrorToast('Missing Data', 'Please enter a name as ID.');
        return;
    }
    
    try {
        // Prepare the location group data
        const locationGroupData = {
            name: nameAsId,
            includedLocationIds: modalIncludedLocations.map(loc => loc.id),
            excludedLocationIds: modalExcludedLocations.map(loc => loc.id)
        };
        
        // Call the API to save location group
        const response = await fetch(`${API_CONFIG.locations_api_url}/location-groups`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(locationGroupData)
        });
        
        if (response.ok) {
            const data = await response.json();
            availableLocationGroups = {...availableLocationGroups, ...formatLocationGroups(data)};
            // Close the modal
            closeAddLocationModal();
            
            // Add the location group to the current selection
            if (!currentData.locations) {
                currentData.locations = [];
            }
            
            // Add the new location group to the selection
            for (const [key, value] of Object.entries(data)) {
                const included = value.includedLocations.map(loc => ({
                    "name": loc.name+","+loc.countryCode+","+loc.type, 
                    "id": loc.locationId
                }));
                const excluded = value.excludedLocations.map(loc => ({
                    "name": loc.name+","+loc.countryCode+","+loc.type, 
                    "id": loc.locationId
                }));
                const name = key;
                currentData.locations.push({
                    includedLocations: included,
                    excludedLocations: excluded,
                    nameAsId: name
                });
                removeLocationFromNotFoundList(name);
            }
            
            // Refresh the display
            displayEditableForm(currentData);
            
            // Re-render chips
            renderIncludedLocationChips();
            renderExcludedLocationChips();
            
            showSuccessToast('Location Group Added', `Successfully added "${nameAsId}" as a location group to the database and selection.`);
        } else {
            showErrorToast('Save Error', data.detail || 'Failed to save location group to database.');
        }
    } catch (err) {
        console.error('Error saving location group:', err);
        showErrorToast('Save Error', 'An error occurred while saving the location group: ' + err.message);
    }
}

function removeLocationFromNotFoundList(locationName) {
    console.log('removeLocationFromNotFoundList called with:', locationName);
    const list = document.getElementById('locationsNotFoundList');
    if (!list) {
        console.log('locationsNotFoundList not found');
        return;
    }
    
    // Find and remove the item
    const items = list.querySelectorAll('.location-not-found-item');
    console.log('Found', items.length, 'items in not found list');
    items.forEach((item, index) => {
        const nameElement = item.querySelector('.location-not-found-name');
        console.log('Item', index, 'name element:', nameElement);
        if (nameElement) {
            console.log('Item', index, 'text content:', nameElement.textContent);
        }
        if (nameElement && nameElement.textContent === locationName) {
            console.log('Removing item', index);
            item.remove();
        }
    });
    
    // Hide the section if no more items
    if (list.children.length === 0) {
        document.getElementById('locationsNotFoundSection').style.display = 'none';
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('addLocationModal');
    if (e.target === modal) {
        closeAddLocationModal();
    }
});