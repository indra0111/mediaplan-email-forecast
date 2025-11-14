let currentData = null;
let availableCohorts = []; // Store all available cohorts for searching
let availableLocations = []; // Store all available locations for searching
let availableLocationGroups = {}; // Store all available location groups for searching
let selectedCohortFromDropdown = null;
let selectedPresetFromDropdown = null;
let selectedAudienceSegmentFromDropdown = null;
let audienceSegmentFromDropdown = [];
let selectedIncludedLocationFromDropdown = null;
let selectedExcludedLocationFromDropdown = null;
let highlightedIndex = -1;
let locationHighlightedIndex = -1;
let excludedLocationHighlightedIndex = -1;
let includedLocationChips = []; // Array to store included location chips
let excludedLocationChips = []; // Array to store excluded location chips
let selectedFiles = []; // Array to store selected files
let currentForecastData = null; // Store the current forecast data for CSV download
let modalSingleLocation = null; // Store the selected single location in modal
let modalIncludedLocations = []; // Store included locations in modal
let modalExcludedLocations = []; // Store excluded locations in modal
let availablePresets = ["TIL_All_Cluster_RNF","TIL_TOI_Only_RNF","TIL_ET_Only_RNF",               
    "TIL_ET_And_TOI_RNF","TIL_NBT_Only_RNF","TIL_All_Languages_RNF","TIL_MT_Only_RNF",
    "TIL_VK_Only_RNF","TIL_IAG_Only_RNF","TIL_EIS_Only_RNF","TIL_Tamil_Only_RNF",
    "TIL_Telugu_Only_RNF","TIL_Malayalam_Only_RNF"]; // Store all available presets for searching
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
        error.className = 'alert alert-danger';
        error.classList.remove('d-none');
        error.classList.add('show');
        
        // Scroll to error
        error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Auto-hide after duration
        setTimeout(() => {
            error.classList.remove('show');
            error.classList.add('d-none');
            error.textContent = '';
        }, duration);
    }
}

function showSuccess(message, duration = 5000) {
    const error = document.getElementById('error');
    if (error) {
        error.textContent = message;
        error.className = 'alert alert-success';
        error.classList.remove('d-none');
        error.classList.add('show');
        
        // Don't scroll for success messages - they're not critical
        // error.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Auto-hide after duration
        setTimeout(() => {
            error.classList.remove('show');
            error.classList.add('d-none');
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
function showSuccessToast(title, message, duration = 5000) {
    return showToast({
        title,
        message,
        type: 'success',
        duration,
        showProgress: true
    });
}

function showErrorToast(title, message, duration = 5000) {
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

function showInfoToast(title, message, duration = 5000) {
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
    error.classList.add('d-none');
    editableForm.classList.add('d-none');
    forecastResults.innerHTML = '';
    const forecastResultsCard = document.getElementById('forecastResultsCard');
    if (forecastResultsCard) {
        forecastResultsCard.classList.add('d-none');
    }
    
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
            const flattenedCohortAbvrs = [];
            for (const cohortName in data.cohort_auds) {
                if (Array.isArray(data.cohort_auds[cohortName])) {
                    const cohortAbvrs = data.cohort_auds[cohortName].map(abvr => ({
                        abvr: abvr.abvr,
                        name: abvr.name,
                        description: abvr.description,
                        similarity: abvr.similarity,
                        checked: true
                    }));
                    flattenedCohortAbvrs.push(...cohortAbvrs);
                }
            }
            data.cohort_abvrs = flattenedCohortAbvrs;
            data.abvrs = (data.abvrs || []).map(abvr => ({
                abvr: abvr.abvr,
                name: abvr.name,
                description: abvr.description,
                similarity: abvr.similarity,
                checked: true
            }));
            data.left_abvrs = (data.left_abvrs || []).map(abvr => ({
                abvr: abvr.abvr,
                name: abvr.name,
                description: abvr.description,
                similarity: abvr.similarity,
                checked: false
            }));
            data.keywords = (data.keywords || []).map(keyword => ({
                keyword: keyword,
                checked: true
            }));
            data.cohort = (data.cohort || []).map(cohort => ({
                name: cohort,
                checked: true
            }));
            data.preset = (data.preset || []).map(preset => ({
                name: preset,
                checked: true
            }));
            data.locations = (data.locations || []).map(location => ({
                ...location,
                checked: true
            }));
            // Store cohort_auds if it exists and add checked property to each ABVR
            if (data.cohort_auds) {
                for (const cohortName in data.cohort_auds) {
                    if (Array.isArray(data.cohort_auds[cohortName])) {
                        data.cohort_auds[cohortName] = data.cohort_auds[cohortName].map(abvr => ({
                            ...abvr,
                            checked: abvr.checked !== undefined ? abvr.checked : true
                        }));
                    }
                }
            }
            // Store cohort_ppts if it exists
            if (data.cohort_ppts) {
                data.cohort_ppts = data.cohort_ppts;
            }
            currentData = data;
            // Get all available cohorts from the helper
            availableCohorts = await getAllAvailableCohorts();
            // Get all available locations from the API
            availableLocations = await getAllAvailableLocations();
            // Get all available location groups from the API
            const unformattedAvailableLocationGroups = await getAllAvailableLocationGroups();
            availableLocationGroups = formatLocationGroups(unformattedAvailableLocationGroups);
            displayEditableForm(data);
            editableForm.classList.remove('d-none');
            
            // Render chips AFTER locations are fetched and form is displayed
            renderIncludedLocationChips();
            renderExcludedLocationChips();

            const locations_not_found = data.locations_not_found;
            if (locations_not_found) {
                displayLocationsNotFound(locations_not_found);
            }
            document.getElementById('editableForm').scrollIntoView({
                behavior: 'smooth'
            });
            showSuccessToast('Processing Success', 'Email processed successfully');
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
            !currentData.cohort.some(c => c.name === cohort)
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

function setupPresetSearch() {
    const searchInput = document.getElementById('presetSearch');
    const dropdown = document.getElementById('presetSearchDropdown');
    
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        highlightedIndex = -1;
        
        if (searchTerm.length === 0) {
            hidePresetDropdown();
            return;
        }
        const matchingPresets = availablePresets.filter(preset =>
            preset.toLowerCase().includes(searchTerm) &&
            !currentData.preset.some(p => p.name === preset)
        );
        
        showPresetDropdown(matchingPresets, searchTerm);
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
                selectPresetFromDropdown(dropdownItems[highlightedIndex].textContent);
            } else {
                addSelectedPreset();
            }
        } else if (e.key === 'Escape') {
            hidePresetDropdown();
        }
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            hidePresetDropdown();
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

function showPresetDropdown(matchingPresets, searchTerm) {
    const dropdown = document.getElementById('presetSearchDropdown');
    
    if (matchingPresets.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching presets found</div>';
    } else {
        dropdown.innerHTML = matchingPresets.map(preset => 
            `<div class="search-dropdown-item" onclick="selectPresetFromDropdown('${preset}')">${preset}</div>`
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

function hidePresetDropdown() {
    const dropdown = document.getElementById('presetSearchDropdown');
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

function updatePresetHighlight(dropdownItems) {
    dropdownItems.forEach((item, index) => {
        if (index === highlightedIndex) {
            item.classList.add('highlighted');
            selectedPresetFromDropdown = item.textContent;
        } else {
            item.classList.remove('highlighted');
        }
    });
    
    if (highlightedIndex === -1) {
        selectedPresetFromDropdown = null;
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

function selectPresetFromDropdown(preset) {
    selectedPresetFromDropdown = preset;
    document.getElementById('presetSearch').value = preset;
    hidePresetDropdown();
}

function selectIncludedLocationFromDropdown(option) {
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

const updateCheckedAbvrs = (data, field, notSelected) => {
    let checked = [];
    for(const item of data){
        if(!notSelected.includes(item[field])){
            item.checked = true;
        } else {
            item.checked = false;
        }
        checked.push(item);
    }
    return checked;
};

async function addSelectedCohort() {
    const addSelectedCohortBtn = document.getElementById('addSelectedCohortBtn');
    const originalText = addSelectedCohortBtn.textContent;
    addSelectedCohortBtn.textContent = 'Adding Cohort...';
    addSelectedCohortBtn.disabled = true;
    const searchInput = document.getElementById('cohortSearch');
    let cohortToAdd = selectedCohortFromDropdown || searchInput.value.trim();
    
    if (!cohortToAdd) {
        showErrorToast('Missing Cohort', 'Please select or enter a cohort name.');
        addSelectedCohortBtn.textContent = originalText;
        addSelectedCohortBtn.disabled = false;
        return;
    }
    
    // Check if cohort exists in available cohorts
    const cohortNames = availableCohorts.map(cohort => cohort.name);
    const exactMatch = cohortNames.find(cohort => 
        cohort.toLowerCase() === cohortToAdd.toLowerCase()
    );
    
    if (!exactMatch) {
        showErrorToast('Cohort Not Found', `Cohort "${cohortToAdd}" not found in available cohorts.`);
        addSelectedCohortBtn.textContent = originalText;
        addSelectedCohortBtn.disabled = false;
        return;
    }
    
    // Check if already selected
    let selected = false, found = false
    const selectedCohorts = Array.from(document.querySelectorAll('.cohort-checkbox:checked')).map(checkbox => checkbox.value);
    for(const cohort of currentData.cohort){
        if(cohort.name === exactMatch){
            if(selectedCohorts.includes(cohort.name)){
                selected = true;
            }
            cohort.checked = true;
            found = true;
        } else {
            cohort.checked = selectedCohorts.includes(cohort.name);
        }
    }
    if (!found) {
        currentData.cohort.push({name: exactMatch, checked: true});
    }
    if (selected) {
        showErrorToast('Already Selected', `Cohort "${exactMatch}" is already selected.`);
        addSelectedCohortBtn.textContent = originalText;
        addSelectedCohortBtn.disabled = false;
        return;
    }
    
    const response = await fetch('/add-cohort', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            keywords: (currentData.keywords || []).map(keyword => keyword.keyword),
            cohorts: (currentData.cohort || []).map(cohort => cohort.name)
        })
    });
    
    if (response.ok) {
        const data = await response.json();
        const cohortAbvrs = data.cohort_auds || {};
        const cohortPpts = data.cohort_ppts || {};
        currentData.cohort_ppts = cohortPpts;
        const abvrs_mapped = Object.values(cohortAbvrs).flat().map(item => item.abvr);
        const current_cohort_removed_abvrs = (currentData.cohort_abvrs || []).map(item => item.abvr).filter(abvr => !Array.from(document.querySelectorAll('.abvr-checkbox:checked')).map(checkbox => checkbox.value).includes(abvr));
        const checkedCohortAbvrs = updateCheckedAbvrs(Object.values(cohortAbvrs).flat(), "abvr", current_cohort_removed_abvrs);
        const abvrs = (currentData.abvrs || []).filter(abvr => !abvrs_mapped.includes(abvr.abvr));
        const left_abvrs = (currentData.left_abvrs || []).filter(abvr => !abvrs_mapped.includes(abvr.abvr));
        currentData.cohort_abvrs = checkedCohortAbvrs;

        currentData.cohort_auds[exactMatch] = checkedCohortAbvrs.map(abvr => ({
            abvr: abvr.abvr,
            name: abvr.name,
            description: abvr.description,
            similarity: abvr.similarity,
            checked: abvr.checked
        }));
        
        currentData.abvrs = abvrs;
        currentData.left_abvrs = left_abvrs;
    }

    // Refresh the display
    displayEditableForm(currentData);
    
    // // Re-render chips after form refresh
    // renderIncludedLocationChips();
    // renderExcludedLocationChips();
    
    // Clear the search input and reset selection
    searchInput.value = '';
    selectedCohortFromDropdown = null;
    hideDropdown();
    
    // Show success message
    showSuccessToast('Cohort Added', `Added "${exactMatch}" to the selection.`);
    addSelectedCohortBtn.textContent = originalText;
    addSelectedCohortBtn.disabled = false;
}

async function addSelectedPreset() {
    const searchInput = document.getElementById('presetSearch');
    let presetToAdd = selectedPresetFromDropdown || searchInput.value.trim();
    
    if (!presetToAdd) {
        showErrorToast('Missing Preset', 'Please select or enter a preset name.');
        return;
    }

    // Check if preset exists in available presets
    const presetNames = availablePresets.map(preset => preset);
    const exactMatch = presetNames.find(preset => 
        preset.toLowerCase() === presetToAdd.toLowerCase()
    );

    if (!exactMatch) {
        showErrorToast('Preset Not Found', `Preset "${presetToAdd}" not found in available presets.`);
        return;
    }
    
    const existingPreset = currentData.preset.find(p => p.name === exactMatch);
    if (existingPreset) {
        if (!existingPreset.checked) {
            existingPreset.checked = true;
            displayEditableForm(currentData);
            showInfoToast('Preset Selected', `Preset "${exactMatch}" is already in the list and has been selected.`);
        } else {
            showErrorToast('Already Selected', `Preset "${exactMatch}" is already selected.`);
        }
        searchInput.value = '';
        selectedPresetFromDropdown = null;
        hidePresetDropdown();
        return;
    }
    
    // Add the preset
    currentData.preset.push({name: exactMatch, checked: true});

    // Refresh the display
    displayEditableForm(currentData);
    
    // // Re-render chips after form refresh
    // renderIncludedLocationChips();
    // renderExcludedLocationChips();
    
    // Clear the search input and reset selection
    searchInput.value = '';
    selectedPresetFromDropdown = null;
    hidePresetDropdown();
    
    // Show success message
    showSuccessToast('Preset Added', `Added "${exactMatch}" to the selection.`);
}

function editLocation(index) {
    const location = currentData.locations[index];
    if (!location) return;
    const editModal = document.createElement('div');
    editModal.className = 'modal';
    editModal.id = 'editLocationModal';
    editModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Edit Location</h3>
                <span class="modal-close" onclick="closeEditLocationModal()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="editNameAsId">Location Name:</label>
                    <input type="text" id="editNameAsId" value="${location.nameAsId || ''}" class="search-input" autocomplete="off">
                </div>
                <div class="form-group">
                    <label>Included Locations:</label>
                    <div class="edit-location-chips" id="editIncludedLocations">
                        ${location.includedLocations.map(loc => `
                            <span class="chip">
                                ${typeof loc === 'string' ? loc : loc.name}
                                <button class="remove-chip" onclick="removeEditIncludedLocation('${typeof loc === 'string' ? loc : loc.name}')">&times;</button>
                            </span>
                        `).join('')}
                    </div>
                    <div class="search-input-container">
                        <input type="text" id="editIncludedLocationInput" placeholder="Add included location..." class="search-input" autocomplete="off">
                        <div id="editIncludedLocationDropdown" class="search-dropdown"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Excluded Locations:</label>
                    <div class="edit-location-chips" id="editExcludedLocations">
                        ${location.excludedLocations.map(loc => `
                            <span class="chip">
                                ${typeof loc === 'string' ? loc : loc.name}
                                <button class="remove-chip" onclick="removeEditExcludedLocation('${typeof loc === 'string' ? loc : loc.name}')">&times;</button>
                            </span>
                        `).join('')}
                    </div>
                    <div class="search-input-container">
                        <input type="text" id="editExcludedLocationInput" placeholder="Add excluded location..." class="search-input" autocomplete="off">
                        <div id="editExcludedLocationDropdown" class="search-dropdown"></div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" onclick="closeEditLocationModal()" class="btn-secondary">Cancel</button>
                <button type="button" onclick="saveEditedLocation(${index})" class="btn-primary">Save Changes</button>
            </div>
        </div>
    `;
    document.body.appendChild(editModal);
    setupEditLocationSearch();
    editModal.style.display = 'block';
}

function closeEditLocationModal() {
    const modal = document.getElementById('editLocationModal');
    if (modal) {
        modal.remove();
    }
}

function setupEditLocationSearch() {
    const includedInput = document.getElementById('editIncludedLocationInput');
    const excludedInput = document.getElementById('editExcludedLocationInput');
    if (includedInput) {
        const newIncludedInput = includedInput.cloneNode(true);
        includedInput.parentNode.replaceChild(newIncludedInput, includedInput);
        newIncludedInput.addEventListener('input', function() {
            const searchTerm = this.value.trim().toLowerCase();
            if (searchTerm.length === 0) {
                document.getElementById('editIncludedLocationDropdown').style.display = 'none';
                return;
            }
            const matchingLocations = availableLocations.filter(location =>
                location.name.toLowerCase().includes(searchTerm) &&
                !Array.from(document.querySelectorAll('#editIncludedLocations .chip')).some(chip => 
                    chip.textContent.replace('×', '').trim() === location.name
                )
            );
            showEditLocationDropdown(matchingLocations, 'editIncludedLocationDropdown', 'included');
        });
        newIncludedInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const searchTerm = this.value.trim();
                if (searchTerm) {
                    const exactMatch = availableLocations.find(loc => 
                        loc.name.toLowerCase() === searchTerm.toLowerCase()
                    );
                    if (exactMatch) {
                        addEditLocation(exactMatch, 'included');
                    } else {
                        const matchingLocations = availableLocations.filter(location =>
                            location.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
                            !Array.from(document.querySelectorAll('#editIncludedLocations .chip')).some(chip => 
                                chip.textContent.replace('×', '').trim() === location.name
                            )
                        );
                        if (matchingLocations.length > 0) {
                            showEditLocationDropdown(matchingLocations, 'editIncludedLocationDropdown', 'included');
                        }
                    }
                }
            }
        });
    }
    
    if (excludedInput) {
        const newExcludedInput = excludedInput.cloneNode(true);
        excludedInput.parentNode.replaceChild(newExcludedInput, excludedInput);
        newExcludedInput.addEventListener('input', function() {
            const searchTerm = this.value.trim().toLowerCase();
            if (searchTerm.length === 0) {
                document.getElementById('editExcludedLocationDropdown').style.display = 'none';
                return;
            }
            const matchingLocations = availableLocations.filter(location =>
                location.name.toLowerCase().includes(searchTerm) &&
                !Array.from(document.querySelectorAll('#editExcludedLocations .chip')).some(chip => 
                    chip.textContent.replace('×', '').trim() === location.name
                )
            );
            showEditLocationDropdown(matchingLocations, 'editExcludedLocationDropdown', 'excluded');
        });
        newExcludedInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const searchTerm = this.value.trim();
                if (searchTerm) {
                    const exactMatch = availableLocations.find(loc => 
                        loc.name.toLowerCase() === searchTerm.toLowerCase()
                    );
                    if (exactMatch) {
                        addEditLocation(exactMatch, 'excluded');
                    } else {
                        const matchingLocations = availableLocations.filter(location =>
                            location.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
                            !Array.from(document.querySelectorAll('#editExcludedLocations .chip')).some(chip => 
                                chip.textContent.replace('×', '').trim() === location.name
                            )
                        );
                        if (matchingLocations.length > 0) {
                            showEditLocationDropdown(matchingLocations, 'editExcludedLocationDropdown', 'excluded');
                        }
                    }
                }
            }
        });
    }
}

function showEditLocationDropdown(matchingLocations, dropdownId, type) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    if (matchingLocations.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching locations found</div>';
    } else {
        dropdown.innerHTML = matchingLocations.map((location, idx) => 
            `<div class="search-dropdown-item" data-idx="${idx}">${location.name}</div>`
        ).join('');
        const items = dropdown.querySelectorAll('.search-dropdown-item');
        items.forEach((item, idx) => {
            item.addEventListener('click', function() {
                addEditLocation(matchingLocations[idx], type);
            });
        });
    }
    dropdown.style.display = 'block';
}

function addEditLocation(location, type) {
    const container = document.getElementById(`edit${type.charAt(0).toUpperCase() + type.slice(1)}Locations`);
    if (!container) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `
        ${location.name}
        <button class="remove-chip" onclick="removeEdit${type.charAt(0).toUpperCase() + type.slice(1)}Location('${location.name}')">&times;</button>
    `;
    container.appendChild(chip);
    const input = document.getElementById(`edit${type.charAt(0).toUpperCase() + type.slice(1)}LocationInput`);
    if (input) input.value = '';
    document.getElementById(`edit${type.charAt(0).toUpperCase() + type.slice(1)}LocationDropdown`).style.display = 'none';
}

function removeEditIncludedLocation(locationName) {
    const chips = document.querySelectorAll('#editIncludedLocations .chip');
    chips.forEach(chip => {
        if (chip.textContent.includes(locationName)) {
            chip.remove();
        }
    });
}

function removeEditExcludedLocation(locationName) {
    const chips = document.querySelectorAll('#editExcludedLocations .chip');
    chips.forEach(chip => {
        if (chip.textContent.includes(locationName)) {
            chip.remove();
        }
    });
}

function saveEditedLocation(index) {
    const nameAsId = document.getElementById('editNameAsId').value.trim();
    const includedChips = document.querySelectorAll('#editIncludedLocations .chip');
    const excludedChips = document.querySelectorAll('#editExcludedLocations .chip');
    const includedLocations = Array.from(includedChips).map(chip => {
        const locationName = chip.textContent.replace('×', '').trim();
        const foundLocation = availableLocations.find(loc => loc.name === locationName);
        return foundLocation || { name: locationName, id: null };
    });
    const excludedLocations = Array.from(excludedChips).map(chip => {
        const locationName = chip.textContent.replace('×', '').trim();
        const foundLocation = availableLocations.find(loc => loc.name === locationName);
        return foundLocation || { name: locationName, id: null };
    });
    currentData.locations[index] = {
        includedLocations: includedLocations,
        excludedLocations: excludedLocations,
        nameAsId: nameAsId,
        checked: currentData.locations[index].checked
    };
    if((includedLocations.length !== 1 || excludedLocations.length > 0)){
        saveLocationGroup({"nameAsId": nameAsId, "includedLocations": includedLocations, "excludedLocations": excludedLocations});
    }
    displayEditableForm(currentData);
    closeEditLocationModal();
    showSuccessToast('Location Updated', 'Location has been updated successfully!');
}

function displayEditableForm(data) {
    // Display Cohorts with checkboxes and "Select All" option
    const cohortsContainer = document.getElementById('cohortsContainer');
    const cohort_auds = data.cohort_auds || {};
    const cohortPpts = data.cohort_ppts || {};
    
    cohortsContainer.innerHTML = `
        <div class="select-all-section">
            <input type="checkbox" id="selectAllCohorts" ${data.cohort.every(cohort => cohort.checked) ? 'checked' : ''}>
            <label for="selectAllCohorts"><strong>Select All Cohorts</strong></label>
        </div>
        ${data.cohort.map(cohort => {
            const cohortAbvrs = cohort_auds[cohort.name] || [];
            const hasAbvrs = cohortAbvrs.length > 0;
            const pptLink = cohortPpts[cohort.name];
            const expandIcon = hasAbvrs ? '<span class="expand-icon">▶</span>' : '';
            
            return `
            <div class="cohort-item-wrapper mb-2">
                <div class="d-flex align-items-center gap-2 p-2 border rounded" data-cohort-name="${cohort.name}">
                    ${hasAbvrs ? '<span class="cohort-expand-toggle" onclick="toggleCohortExpand(this, \'' + cohort.name + '\')">▶</span>' : '<span class="cohort-expand-toggle-placeholder"></span>'}
                    <input type="checkbox" class="form-check-input cohort-checkbox" value="${cohort.name}" ${cohort.checked ? 'checked' : ''}>
                    <span class="badge bg-success">${cohort.name}</span>
                    ${hasAbvrs ? `<span class="text-muted small">(${cohortAbvrs.length} ABVRs)</span>` : ''}
                    ${pptLink ? `<a href="${pptLink}" target="_blank" class="btn btn-sm btn-secondary ms-auto" title="Open Presentation"><i class="bi bi-file-earmark-slides me-1"></i>View Existing PPT</a>` : ''}
                </div>
                ${hasAbvrs ? `
                <div class="cohort-abvrs-container d-none" id="cohort-abvrs-${cohort.name}">
                    ${cohortAbvrs.map(abvr => `
                        <div class="cohort-abvr-item">
                            <input type="checkbox" class="cohort-abvr-checkbox" value="${abvr.abvr}" data-cohort="${cohort.name}" ${abvr.checked !== false ? 'checked' : ''}>
                            <div class="cohort-abvr-content">
                                <div class="cohort-abvr-name">${abvr.name}</div>
                                <div class="cohort-abvr-description">${abvr.description || ''}</div>
                                <div class="cohort-abvr-code">ABVR: ${abvr.abvr}</div>
                                ${abvr.similarity !== undefined ? `<div class="cohort-abvr-similarity">Similarity: ${(abvr.similarity * 100).toFixed(1)}%</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
            </div>
            `;
        }).join('')}
    `;
    
    // Display Locations with checkboxes and "Select All" option
    const locationsContainer = document.getElementById('locationsContainer');
    const locations = data.locations || [];
    locationsContainer.innerHTML = `
        <div class="location-select-all">
            <input type="checkbox" id="selectAllLocations" ${locations.every(location => location.checked) ? 'checked' : ''}>
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
            
            return `<div class="d-flex align-items-center gap-2 p-2 border rounded mb-2">
                <input type="checkbox" class="form-check-input location-checkbox" value="${index}" ${location.checked ? 'checked' : ''}>
                <div class="flex-grow-1">
                    <div class="text-success fw-bold">${included}${excludedText}${nameAsId}</div>
                </div>
                <button class="btn btn-sm btn-outline-secondary" onclick="editLocation(${index})" title="Edit Location"><i class="bi bi-pencil"></i></button>
            </div>`;
        }).join('')}
    `;
    
    // Display Presets as deletable chips
    const presetsContainer = document.getElementById('presetsContainer');
    const presets = data.preset || [];
    presetsContainer.innerHTML = `
        <div class="d-flex flex-wrap gap-2" id="presetsChipsContainer">
            ${presets.map((preset, index) => `
                <span class="keyword-chip ${preset.checked ? 'keyword-chip-selected' : 'keyword-chip-unselected'}" 
                      data-preset="${preset.name}" 
                      data-index="${index}"
                      onclick="togglePresetSelection('${preset.name}')">
                    ${preset.name}
                    <button type="button" class="remove-keyword-chip" onclick="removePreset('${preset.name}', event)" title="Remove preset">
                        <i class="bi bi-x"></i>
                    </button>
                </span>
            `).join('')}
        </div>
    `;
    
    // Display Keywords as deletable chips
    const keywordsContainer = document.getElementById('keywordsContainer');
    const keywords = data.keywords || [];
    keywordsContainer.innerHTML = `
        <div class="d-flex flex-wrap gap-2" id="keywordsChipsContainer">
            ${keywords.map((keyword, index) => `
                <span class="keyword-chip ${keyword.checked ? 'keyword-chip-selected' : 'keyword-chip-unselected'}" 
                      data-keyword="${keyword.keyword}" 
                      data-index="${index}"
                      onclick="toggleKeywordSelection('${keyword.keyword}')">
                    ${keyword.keyword}
                    <button type="button" class="remove-keyword-chip" onclick="removeKeyword('${keyword.keyword}', event)" title="Remove keyword">
                        <i class="bi bi-x"></i>
                    </button>
                </span>
            `).join('')}
        </div>
    `;
    
    // Set Creative Settings
    document.querySelector(`input[name="creativeSize"][value="${data.creative_size}"]`).checked = true;
    document.querySelector(`input[name="deviceCategory"][value="${data.device_category.split(" ")[0]}"]`).checked = true;
    document.querySelector(`input[name="targetGender"][value="${data.target_gender}"]`).checked = true;
    document.getElementById('duration').value = parseInt(data.duration.split(" ")[0]);

    // Set Age Selection - Parse existing target_age value
    setAgeRangeFromString(data.target_age);

    // Display ABVRs with checkboxes and "Select All" option
    const abvrsContainer = document.getElementById('abvrsContainer');
    const model_selected_abvrs = data.abvrs || [];
    const left_abvrs = data.left_abvrs || [];
    abvrsContainer.innerHTML = `
        <div id="abvrChipsContainer" class="abvr-chips-container" style="display: none;"></div>
        <div class="abvr-select-all">
            <input type="checkbox" id="selectAllAbvrs">
            <label for="selectAllAbvrs"><strong>Select All Audiences</strong></label>
        </div>
        <div class="abvr-section">
            <h4>Selected Audiences (Recommended)</h4>
            <div class="abvr-list">
                ${model_selected_abvrs.map(abvr => `
                    <div class="abvr-item">
                        <input type="checkbox" class="abvr-checkbox" value="${abvr.abvr}" ${abvr.checked ? 'checked' : ''}>
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
            <h4>Additional Audiences</h4>
            <div class="abvr-list">
                ${left_abvrs.map(abvr => `
                    <div class="abvr-item">
                        <input type="checkbox" class="abvr-checkbox" value="${abvr.abvr}" ${abvr.checked ? 'checked' : ''}>
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
    setupSelectAllCheckbox('selectAllAbvrs', 'abvr-checkbox');
    
    // Setup event listeners for cohort ABVR checkboxes
    setupCohortAbvrCheckboxes();
    
    // Setup cohort search functionality
    setupCohortSearch();
    setupPresetSearch();
    setupABVRSearch();
}

function setupCohortAbvrCheckboxes() {
    const cohortAbvrCheckboxes = document.querySelectorAll('.cohort-abvr-checkbox');
    cohortAbvrCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const abvrCode = this.value;
            const cohortName = this.getAttribute('data-cohort');
            const isChecked = this.checked;
            
            // Update the data model
            if (currentData && currentData.cohort_auds && currentData.cohort_auds[cohortName]) {
                const abvr = currentData.cohort_auds[cohortName].find(a => a.abvr === abvrCode);
                if (abvr) {
                    abvr.checked = isChecked;
                }
            }
        });
    });
}

function toggleCohortExpand(toggleElement, cohortName) {
    const container = document.getElementById(`cohort-abvrs-${cohortName}`);
    if (!container) return;
    
    const isExpanded = !container.classList.contains('d-none');
    
    if (isExpanded) {
        container.classList.add('d-none');
        toggleElement.textContent = '▶';
    } else {
        container.classList.remove('d-none');
        toggleElement.textContent = '▼';
    }
}

function setupSelectAllCheckbox(selectAllId, checkboxClass) {
    const selectAllCheckbox = document.getElementById(selectAllId);
    const checkboxes = document.querySelectorAll('.' + checkboxClass);
    
    // Add event listener for "Select All" checkbox
    selectAllCheckbox.addEventListener('change', function() {
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            // Update the data model for different checkbox types
            if (checkboxClass === 'cohort-checkbox') {
                updateCohortCheckedStatus(checkbox.value, this.checked);
            } else if (checkboxClass === 'location-checkbox') {
                updateLocationCheckedStatus(checkbox.value, this.checked);
            } else if (checkboxClass === 'keyword-checkbox') {
                updateKeywordCheckedStatus(checkbox.value, this.checked);
            } else if (checkboxClass === 'abvr-checkbox') {
                updateAbvrCheckedStatus(checkbox.value, this.checked);
            }
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
            
            // Update the data model for different checkbox types
            if (checkboxClass === 'cohort-checkbox') {
                updateCohortCheckedStatus(this.value, this.checked);
            } else if (checkboxClass === 'location-checkbox') {
                updateLocationCheckedStatus(this.value, this.checked);
            } else if (checkboxClass === 'keyword-checkbox') {
                updateKeywordCheckedStatus(this.value, this.checked);
            } else if (checkboxClass === 'abvr-checkbox') {
                updateAbvrCheckedStatus(this.value, this.checked);
            }
        });
    });
}

// Add these helper functions for other checkbox types
function updatePresetCheckedStatus(presetName, isChecked) {
    if (!currentData || !currentData.preset) return;
    
    // Find the preset in currentData and update its checked status
    const preset = currentData.preset.find(p => p.name === presetName);
    if (preset) {
        preset.checked = isChecked;
        // Update chip visual state
        const chip = document.querySelector(`.keyword-chip[data-preset="${presetName}"]`);
        if (chip) {
            if (isChecked) {
                chip.classList.remove('keyword-chip-unselected');
                chip.classList.add('keyword-chip-selected');
            } else {
                chip.classList.remove('keyword-chip-selected');
                chip.classList.add('keyword-chip-unselected');
            }
        }
    }
}

function togglePresetSelection(presetName) {
    if (!currentData || !currentData.preset) return;
    const preset = currentData.preset.find(p => p.name === presetName);
    if (preset) {
        const newCheckedState = !preset.checked;
        updatePresetCheckedStatus(presetName, newCheckedState);
    }
}

function removePreset(presetName, event) {
    if (event) {
        event.stopPropagation();
    }
    
    if (!currentData || !currentData.preset) return;
    
    // Remove from currentData
    currentData.preset = currentData.preset.filter(p => p.name !== presetName);
    
    // Re-render form
    displayEditableForm(currentData);
    
    showInfoToast('Preset Removed', `Removed "${presetName}" from presets.`);
}

function updateCohortCheckedStatus(cohortName, isChecked) {
    if (!currentData || !currentData.cohort) return;
    const cohort = currentData.cohort.find(c => c.name === cohortName);
    if (cohort) {
        cohort.checked = isChecked;
    }
    
    // If cohort is deselected, deselect all ABVRs for that cohort
    if (currentData.cohort_auds && currentData.cohort_auds[cohortName]) {
        const cohortAbvrs = currentData.cohort_auds[cohortName];
        const cohortAbvrCodes = cohortAbvrs.map(abvr => abvr.abvr);
        
        // Deselect ABVRs in cohort_auds
        cohortAbvrs.forEach(abvr => {
            abvr.checked = isChecked;
        });
        
        // Deselect ABVRs in cohort_abvrs array
        if (currentData.cohort_abvrs) {
            currentData.cohort_abvrs.forEach(abvr => {
                if (cohortAbvrCodes.includes(abvr.abvr)) {
                    abvr.checked = isChecked;
                }
            });
        }
        
        // Deselect ABVRs in the UI - both in ABVRs section and in expanded cohort section
        cohortAbvrCodes.forEach(abvrCode => {
            // Deselect in main ABVRs section
            const abvrCheckbox = document.querySelector(`.abvr-checkbox[value="${abvrCode}"]`);
            if (abvrCheckbox) {
                abvrCheckbox.checked = isChecked;
            }
            
            // Deselect in expanded cohort section
            const cohortAbvrCheckbox = document.querySelector(`.cohort-abvr-checkbox[value="${abvrCode}"][data-cohort="${cohortName}"]`);
            if (cohortAbvrCheckbox) {
                cohortAbvrCheckbox.checked = isChecked;
            }
        });
        
        // Update the "Select All ABVRs" checkbox state
        const selectAllAbvrsCheckbox = document.getElementById('selectAllAbvrs');
        if (selectAllAbvrsCheckbox) {
            const allAbvrCheckboxes = document.querySelectorAll('.abvr-checkbox');
            const checkedAbvrCheckboxes = document.querySelectorAll('.abvr-checkbox:checked');
            if (checkedAbvrCheckboxes.length === 0) {
                selectAllAbvrsCheckbox.checked = false;
            } else if (checkedAbvrCheckboxes.length === allAbvrCheckboxes.length) {
                selectAllAbvrsCheckbox.checked = true;
            } else {
                selectAllAbvrsCheckbox.checked = false;
            }
        }
    }
}

function updateLocationCheckedStatus(locationIndex, isChecked) {
    if (!currentData || !currentData.locations) return;
    const location = currentData.locations[parseInt(locationIndex)];
    if (location) {
        location.checked = isChecked;
    }
}

function updateKeywordCheckedStatus(keywordText, isChecked) {
    if (!currentData || !currentData.keywords) return;
    const keyword = currentData.keywords.find(k => k.keyword === keywordText);
    if (keyword) {
        keyword.checked = isChecked;
        // Update chip visual state
        const chip = document.querySelector(`.keyword-chip[data-keyword="${keywordText}"]`);
        if (chip) {
            if (isChecked) {
                chip.classList.remove('keyword-chip-unselected');
                chip.classList.add('keyword-chip-selected');
            } else {
                chip.classList.remove('keyword-chip-selected');
                chip.classList.add('keyword-chip-unselected');
            }
        }
    }
}

function toggleKeywordSelection(keywordText) {
    if (!currentData || !currentData.keywords) return;
    const keyword = currentData.keywords.find(k => k.keyword === keywordText);
    if (keyword) {
        const newCheckedState = !keyword.checked;
        updateKeywordCheckedStatus(keywordText, newCheckedState);
    }
}

function removeKeyword(keywordText, event) {
    if (event) {
        event.stopPropagation();
    }
    
    if (!currentData || !currentData.keywords) return;
    
    // Remove from currentData
    currentData.keywords = currentData.keywords.filter(k => k.keyword !== keywordText);
    
    // Re-render keywords
    displayEditableForm(currentData);
    
    showInfoToast('Keyword Removed', `Removed "${keywordText}" from keywords.`);
}


function updateAbvrCheckedStatus(abvrCode, isChecked) {
    // Update in all three ABVR arrays
    if (currentData && currentData.cohort_abvrs) {
        const cohortAbvr = currentData.cohort_abvrs.find(a => a.abvr === abvrCode);
        if (cohortAbvr) cohortAbvr.checked = isChecked;
    }
    
    if (currentData && currentData.cohort_auds) {
        for (const cohortName in currentData.cohort_auds) {
            if (Array.isArray(currentData.cohort_auds[cohortName])) {
                const abvr = currentData.cohort_auds[cohortName].find(a => a.abvr === abvrCode);
                if (abvr) {
                    abvr.checked = isChecked;
                    break;
                }
            }
        }
    }
    
    if (currentData && currentData.abvrs) {
        const abvr = currentData.abvrs.find(a => a.abvr === abvrCode);
        if (abvr) abvr.checked = isChecked;
    }
    
    if (currentData && currentData.left_abvrs) {
        const leftAbvr = currentData.left_abvrs.find(a => a.abvr === abvrCode);
        if (leftAbvr) leftAbvr.checked = isChecked;
    }
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

// Add this to your script.js
function getSelectedValues() {
    const creativeSize = document.querySelector('input[name="creativeSize"]:checked').value;
    const deviceCategory = document.querySelector('input[name="deviceCategory"]:checked').value;
    const targetGender = document.querySelector('input[name="targetGender"]:checked').value;
    
    return { creativeSize, deviceCategory, targetGender };
}

// Update your getForecast function to use this
async function getForecast() {
    if (!currentData) return;
    
    const forecastResults = document.getElementById('forecastResults');
    const getForecastBtn = document.getElementById('getForecastBtn');
    
    // Change button text and disable it
    const originalText = getForecastBtn.textContent;
    getForecastBtn.textContent = 'Getting Forecast...';
    getForecastBtn.disabled = true;
    
    // Get selected Locations (by index)
    const selectedLocationIndices = Array.from(document.querySelectorAll('.location-checkbox:checked'))
        .map(checkbox => parseInt(checkbox.value));
    const selectedLocations = selectedLocationIndices.map(index => currentData.locations[index]);
    
    // Get selected Presets
    const selectedPresets = (currentData.preset || []).filter(p => p.checked).map(p => p.name);
    
    // Get selected Keywords
    const selectedKeywords = (currentData.keywords || []).filter(k => k.checked).map(k => k.keyword);
    
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
    const { creativeSize, deviceCategory, targetGender } = getSelectedValues();
    const targetAge = getAgeRangeString();
    
    if (!targetAge) {
        showErrorToast('Invalid Age Range', 'Please enter a valid age range (minimum age must be less than or equal to maximum age).');
        getForecastBtn.textContent = originalText;
        getForecastBtn.disabled = false;
        return;
    }
    
    const duration = parseInt(document.getElementById('duration').value);
    
    // Clear previous results and hide the card
    forecastResults.innerHTML = '';
    const forecastResultsCard = document.getElementById('forecastResultsCard');
    if (forecastResultsCard) {
        forecastResultsCard.classList.add('d-none');
    }
    
    try {
        const response = await fetch('/get-forecast', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
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
            document.getElementById('forecastResults').scrollIntoView({
                behavior: 'smooth'
            });
            showSuccessToast('Forecast Success', 'Forecast data fetched successfully');
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
    const forecastResultsCard = document.getElementById('forecastResultsCard');
    
    // Store the forecast data globally for CSV download
    currentForecastData = forecastData;
    
    // Show the forecast results card
    if (forecastResultsCard) {
        forecastResultsCard.classList.remove('d-none');
    }
    
    if (forecastData && typeof forecastData === 'object') {
        // Show the download button
        const downloadBtn = document.getElementById('downloadCsvBtn');
        if (downloadBtn) {
            downloadBtn.classList.remove('d-none');
        }
        
        // Show the audience CSV download button
        const downloadAudienceCsvBtn = document.getElementById('downloadAudienceCsvBtn');
        if (downloadAudienceCsvBtn) {
            downloadAudienceCsvBtn.classList.remove('d-none');
        }
                    
        // Show the presentation button
        const presentationBtn = document.getElementById('createPresentationBtn');
        if (presentationBtn) {
            presentationBtn.classList.remove('d-none');
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
        forecastResults.innerHTML = '<div class="alert alert-warning">No forecast data found</div>';
        // Hide the download button if no data
        const downloadBtn = document.getElementById('downloadCsvBtn');
        if (downloadBtn) {
            downloadBtn.classList.add('d-none');
        }
        
        // Hide the audience CSV download button if no data
        const downloadAudienceCsvBtn = document.getElementById('downloadAudienceCsvBtn');
        if (downloadAudienceCsvBtn) {
            downloadAudienceCsvBtn.classList.add('d-none');
        }
        
        // Hide the presentation button if no data
        const presentationBtn = document.getElementById('createPresentationBtn');
        if (presentationBtn) {
            presentationBtn.classList.add('d-none');
        }
    }
}

// Age Range Helper Functions
function getAgeRangeString() {
    const minAge = document.getElementById('targetAgeMin');
    const maxAge = document.getElementById('targetAgeMax');
    
    if (!minAge || !maxAge) {
        return 'All';
    }
    
    const min = parseInt(minAge.value);
    const max = parseInt(maxAge.value);
    
    if (isNaN(min) || isNaN(max)) {
        return 'All';
    }
    
    if (min > max) {
        return null; // Invalid range
    }
    
    // If range is 0-100, treat it as "All"
    if (min === 0 && max === 100) {
        return 'All';
    }
    
    return `${min}-${max}`;
}

function setAgeRangeFromString(ageStr) {
    if (!ageStr) {
        return;
    }
    
    const minAge = document.getElementById('targetAgeMin');
    const maxAge = document.getElementById('targetAgeMax');
    
    if (!minAge || !maxAge) {
        return;
    }
    
    // Handle "All" case - set to 0-100
    if (ageStr.toLowerCase() === 'all') {
        minAge.value = 0;
        maxAge.value = 100;
        return;
    }
    
    // Handle range format (e.g., "18-65")
    const rangeMatch = ageStr.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
        const min = parseInt(rangeMatch[1]);
        const max = parseInt(rangeMatch[2]);
        minAge.value = min;
        // Ensure max doesn't exceed 100
        maxAge.value = Math.min(max, 100);
        return;
    }
    
    // Handle open-ended format (e.g., "18+")
    const openEndedMatch = ageStr.match(/^(\d+)\+$/);
    if (openEndedMatch) {
        minAge.value = parseInt(openEndedMatch[1]);
        maxAge.value = 100; // Set max to 100 for open-ended
        return;
    }
    
    // Default: set to "All" (0-100) if format is not recognized
    minAge.value = 0;
    maxAge.value = 100;
}

// Add validation when age inputs change
document.addEventListener('DOMContentLoaded', function() {
    const minAge = document.getElementById('targetAgeMin');
    const maxAge = document.getElementById('targetAgeMax');
    
    if (minAge && maxAge) {
        minAge.addEventListener('change', function() {
            const min = parseInt(this.value);
            const max = parseInt(maxAge.value);
            if (!isNaN(min) && !isNaN(max) && min > max) {
                showErrorToast('Invalid Age Range', 'Minimum age cannot be greater than maximum age.');
                this.value = max;
            }
            // Ensure min is not less than 0
            if (!isNaN(min) && min < 0) {
                showErrorToast('Invalid Age Range', 'Minimum age cannot be less than 0.');
                this.value = 0;
            }
        });
        
        maxAge.addEventListener('change', function() {
            const min = parseInt(minAge.value);
            const max = parseInt(this.value);
            if (!isNaN(min) && !isNaN(max) && min > max) {
                showErrorToast('Invalid Age Range', 'Maximum age cannot be less than minimum age.');
                this.value = min;
            }
            // Ensure max doesn't exceed 100
            if (!isNaN(max) && max > 100) {
                showErrorToast('Invalid Age Range', 'Maximum age cannot exceed 100.');
                this.value = 100;
            }
            // Ensure max is not less than 0
            if (!isNaN(max) && max < 0) {
                showErrorToast('Invalid Age Range', 'Maximum age cannot be less than 0.');
                this.value = 0;
            }
        });
        
        // Also validate on input event for real-time feedback
        maxAge.addEventListener('input', function() {
            const max = parseInt(this.value);
            if (!isNaN(max) && max > 100) {
                this.value = 100;
            }
        });
    }
});
  
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
    
    const targetAge = getAgeRangeString();
    if(!targetAge) {
        showErrorToast('Age Format Error', 'Please enter a valid target age range for the presentation.');
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
                forecast_data: getPresetNameFromForecastResponse(currentForecastData),
                gender: document.querySelector('input[name="targetGender"]:checked').value,
                age: targetAge,
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.status === 'success') {
            showSuccessToast('Presentation Created', data.message || 'Presentation has been created successfully!');
            
            // Display the Google Slides URL
            if (data.google_slides_url) {
                const ppt_link = data.google_slides_url.replace('https://drive.google.com/file/d/', 'https://docs.google.com/presentation/d/')
                // Create a clickable link to open the Google Slides
                const slidesLink = document.createElement('div');
                slidesLink.className = 'slides-link-container';
                slidesLink.innerHTML = `
                    <div class="slides-link-content">
                        <h4>📊 Presentation Generated Successfully!</h4>
                        <a href="${ppt_link}" target="_blank" class="slides-link-btn">
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
    const selectedAbvrsFromMain = Array.from(document.querySelectorAll('.abvr-checkbox:checked'))
        .map(checkbox => checkbox.value);

    const selectedAbvrsFromCohorts = Array.from(document.querySelectorAll('.cohort-abvr-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    // Combine all selected ABVRs
    const selectedAbvrs = [...new Set([...selectedAbvrsFromMain, ...selectedAbvrsFromCohorts])];

    // Combine abvr data from all sources
    const allAbvrs = [];
    
    // Add ABVRs from cohort_auds (cohort-specific ABVRs)
    if (currentData.cohort_auds) {
        for (const cohortName in currentData.cohort_auds) {
            if (Array.isArray(currentData.cohort_auds[cohortName])) {
                allAbvrs.push(...currentData.cohort_auds[cohortName]);
            }
        }
    }
    
    // Add ABVRs from main sections
    allAbvrs.push(...(currentData.abvrs || []));
    allAbvrs.push(...(currentData.left_abvrs || []));

    // Filter to get only selected ABVRs, avoiding duplicates by abvr code
    const selectedAbvrDetails = [];
    const seenAbvrs = new Set();
    
    allAbvrs.forEach(abvr => {
        if (selectedAbvrs.includes(abvr.abvr) && !seenAbvrs.has(abvr.abvr)) {
            selectedAbvrDetails.push(abvr);
            seenAbvrs.add(abvr.abvr);
        }
    });
    // Get duration
    const duration = parseInt(document.getElementById('duration').value) || 30;
    
    // Generate CSV content
    const csvContent = generateForecastCsv(currentForecastData, selectedAbvrDetails, duration);
    
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
    
    showSuccessToast('Download Complete', 'Your audience forecast data has been downloaded successfully!');
}

function downloadAudienceCsv() {
    if (!currentData) {
        showErrorToast('No Data', 'No Audience data available to download.');
        return;
    }
    
    const selectedAbvrsFromMain = Array.from(document.querySelectorAll('.abvr-checkbox:checked'))
        .map(checkbox => checkbox.value);

    const selectedAbvrsFromCohorts = Array.from(document.querySelectorAll('.cohort-abvr-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    // Combine all selected ABVRs
    const selectedAbvrs = [...new Set([...selectedAbvrsFromMain, ...selectedAbvrsFromCohorts])];

    // Combine abvr data from all sources
    const allAbvrs = [];
    
    // Add ABVRs from cohort_auds (cohort-specific ABVRs)
    if (currentData.cohort_auds) {
        for (const cohortName in currentData.cohort_auds) {
            if (Array.isArray(currentData.cohort_auds[cohortName])) {
                allAbvrs.push(...currentData.cohort_auds[cohortName]);
            }
        }
    }
    
    // Add ABVRs from main sections
    allAbvrs.push(...(currentData.abvrs || []));
    allAbvrs.push(...(currentData.left_abvrs || []));

    // Filter to get only selected ABVRs, avoiding duplicates by abvr code
    const selectedAbvrDetails = [];
    const seenAbvrs = new Set();
    
    allAbvrs.forEach(abvr => {
        if (selectedAbvrs.includes(abvr.abvr) && !seenAbvrs.has(abvr.abvr)) {
            selectedAbvrDetails.push(abvr);
            seenAbvrs.add(abvr.abvr);
        }
    });

    // Build audience data rows
    const abvrRows = [];
    abvrRows.push(['Abvr', 'Name', 'Description']);
    selectedAbvrDetails.forEach(abvr => {
        abvrRows.push([abvr.abvr, abvr.name, abvr.description]);
    });

    // Convert to CSV string
    const csvContent = abvrRows.map(row =>
        row.map(cell => {
            const escaped = String(cell).replace(/"/g, '""');
            if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
                return `"${escaped}"`;
            }
            return escaped;
        }).join(',')
    ).join('\n');
    
    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `audience_data_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccessToast('Download Complete', 'Your audience data has been downloaded successfully!');
}

function generateForecastCsv(forecastData, selectedAbvrDetails, duration) {
    const csvRows = [];

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
    const selectedKeywords = (currentData.keywords || []).filter(k => k.checked).map(k => k.keyword);
    // Check if already exists
    let keywords = []
    let found = false
    for(const keyword of currentData.keywords){
        if(keyword.keyword === keywordToAdd){
            found = true;
            keyword.checked = true;
        } else {
            keyword.checked = selectedKeywords.includes(keyword.keyword);
        }
        keywords.push(keyword);
    }
    if (found) {
        // Keyword already exists, just refresh the display
        currentData.keywords = keywords;
        displayEditableForm(currentData);
        showInfoToast('Keyword Already Selected', `Keyword "${keywordToAdd}" is already selected.`);
        keywordInput.value = '';
        return;
    }
    
    // Add new keyword
    keywords.push({keyword: keywordToAdd, checked: true});
    currentData.keywords = keywords;
    
    // Refresh the display
    displayEditableForm(currentData);
    
    // // Re-render chips after form refresh
    // renderIncludedLocationChips();
    // renderExcludedLocationChips();
    
    // Clear the input
    keywordInput.value = '';
    
    // Show success message
    showSuccessToast('Keyword Added', `Added "${keywordToAdd}" to the selection.`);
}

function updateNameAsIdInputState() {
    const nameAsIdInput = document.getElementById('nameAsIdInput');
    if (!nameAsIdInput) return;
    
    const actualIncludedLocations = includedLocationChips.filter(chip => chip.type !== 'group');
    const hasGroup = includedLocationChips.some(chip => chip.type === 'group');
    
    if (hasGroup) {
        return;
    }
    
    if (actualIncludedLocations.length === 1 && excludedLocationChips.length === 0) {
        nameAsIdInput.disabled = true;
        nameAsIdInput.value = '';
    } else {
        nameAsIdInput.disabled = false;
    }
}

function renderIncludedLocationChips() {
    const container = document.getElementById('includedLocationsChips');
    if (!container) return;
    
    container.innerHTML = includedLocationChips.map((chip, idx) =>
        `<span class="chip${chip.type === 'group' ? ' location-group-chip' : ''}">${chip.type === 'group' ? '🏢 ' : ''}${chip.name}<button class="remove-chip" onclick="removeIncludedLocationChip(${idx})">&times;</button></span>`
    ).join('') + '<input type="text" class="chips-input" id="includedLocationInput" placeholder="Type to search locations..." autocomplete="off">';
    
    setupIncludedLocationInput();
    updateNameAsIdInputState();
}

function renderExcludedLocationChips() {
    const container = document.getElementById('excludedLocationsChips');
    if (!container) return;
    
    container.innerHTML = excludedLocationChips.map((chip, idx) =>
        `<span class="chip">${chip.name}<button class="remove-chip" onclick="removeExcludedLocationChip(${idx})">&times;</button></span>`
    ).join('') + '<input type="text" class="chips-input" id="excludedLocationInput" placeholder="Type to search locations..." autocomplete="off">';
    
    setupExcludedLocationInput();
    updateNameAsIdInputState();
}

function removeIncludedLocationChip(idx) {
    const removedChip = includedLocationChips[idx];
    includedLocationChips.splice(idx, 1);
    renderIncludedLocationChips();
    
    // If the removed chip was a group, re-enable the excluded location input
    if (removedChip && removedChip.type === 'group') {
        const excludedLocationInput = document.getElementById('excludedLocationInput');
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
        if (excludedLocations.length > 0||includedLocations.length > 0) {
            showErrorToast('Invalid Selection', 'Cannot add excluded or included locations when a location group is selected.');
            return;
        }
        nameAsId = groupChip.name;
    }

    if(nameAsId && nameAsId.trim()=="Overall"){
        showErrorToast('Invalid Location Name', '"Overall" is a reserved name. Please choose a different Location Name.');
        return;
    }
    
    // Validation: Check if included locations count is not 1 and excluded locations count is non-zero and nameAsId is empty
    if ((includedLocations.length !== 1 || excludedLocations.length > 0) && !nameAsId) {
        showErrorToast('Missing Location Name', 'A Location Name is required if you haven’t selected exactly one included location or if you’ve excluded any locations.');
        return;
    }
    if(includedLocations.length == 1 && excludedLocations.length == 0){
        nameAsId = includedLocations[0].split(',')[0];
    }
    
    if (!currentData.locations) {
        currentData.locations = [];
    }
    
    let newLocation;
    
    if (groupChip) {
        // For location groups, use the group data structure
        nameAsId = groupChip.groupData.nameAsId;
        newLocation = {
            includedLocations: groupChip.groupData.includedLocations,
            excludedLocations: groupChip.groupData.excludedLocations,
            nameAsId: groupChip.groupData.nameAsId,
            checked: true
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
            nameAsId: nameAsId,
            checked: true
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
    if((includedLocations.length !== 1 || excludedLocations.length > 0) && (!groupChip)){
        saveLocationGroup(newLocation);
    }
    nameAsIdInput.value = '';
    currentData.locations.push(newLocation);
    removeLocationFromNotFoundList(nameAsId)
    displayEditableForm(currentData);
    
    // Clear chips and inputs
    includedLocationChips = [];
    excludedLocationChips = [];
    renderIncludedLocationChips();
    renderExcludedLocationChips();
    showSuccessToast('Location Added', 'Location added successfully!');
}

async function getAbvrsFromKeywords() {
    // Get selected keywords
    const selectedKeywords = (currentData.keywords || []).filter(k => k.checked).map(k => k.keyword)
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
            // Update cohort_auds
            if (!currentData.cohort_auds) {
                currentData.cohort_auds = {};
            }
            for (const cohortName in data.cohort_auds) {
                if (Array.isArray(data.cohort_auds[cohortName])) {
                    currentData.cohort_auds[cohortName] = data.cohort_auds[cohortName].map(abvr => ({
                        abvr: abvr.abvr,
                        name: abvr.name,
                        description: abvr.description,
                        similarity: abvr.similarity,
                        checked: abvr.checked !== undefined ? abvr.checked : true
                    }));
                }
            }
            // Flatten cohort_auds to create cohort_abvrs
            const flattenedCohortAbvrs = [];
            for (const cohortName in currentData.cohort_auds) {
                if (Array.isArray(currentData.cohort_auds[cohortName])) {
                    flattenedCohortAbvrs.push(...currentData.cohort_auds[cohortName]);
                }
            }
            currentData.cohort_abvrs = flattenedCohortAbvrs;
            currentData.abvrs = (data.abvrs || []).map(abvr => ({
                abvr: abvr.abvr,
                name: abvr.name,
                description: abvr.description,
                similarity: abvr.similarity,
                checked: true
            }));
            currentData.left_abvrs = (data.left_abvrs || []).map(abvr => ({
                abvr: abvr.abvr,
                name: abvr.name,
                description: abvr.description,
                similarity: abvr.similarity,
                checked: false
            }));
            
            // Refresh the display
            displayEditableForm(currentData);
            
            // // Re-render chips after form refresh
            // renderIncludedLocationChips();
            // renderExcludedLocationChips();
            
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

async function fetchAudienceSegmentsByName() {
    const abvrSearchInput = document.getElementById('abvrSearch');
    const abvrsToAdd = abvrSearchInput.value.trim();
    if (!abvrsToAdd) {
        return [];
    }
    const selectedKeywords = (currentData.keywords || []).filter(k => k.checked).map(k => k.keyword);
    try{
        const response = await fetch(`/get-audience-segment-by-name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: abvrsToAdd, keywords: selectedKeywords })
        });
        const data = await response.json();
        return data;
    } catch (err) {
        console.error('Error details:', err);
        return [];
    }
}

function setupABVRSearch() {
    const searchInput = document.getElementById('abvrSearch');
    const dropdown = document.getElementById('abvrSearchDropdown');
    if (!searchInput || !dropdown) return;
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim();
        clearTimeout(searchTimeout);
        
        // If user is typing, search for new results
        if (searchTerm.length > 0) {
            searchTimeout = setTimeout(async () => {
                const results = await fetchAudienceSegmentsByName();
                audienceSegmentFromDropdown = results;
                showABVRDropdown();
            }, 300);
        } else {
            // If input is cleared, show dropdown with current selections
            if (selectedAudienceSegmentFromDropdown && selectedAudienceSegmentFromDropdown.length > 0) {
                // Keep the dropdown open to show current selections
                updateABVRDropdownSelection();
            } else {
                hideABVRDropdown();
            }
        }
    });
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSelectedABVR();
        } else if (e.key === 'Escape') {
            hideABVRDropdown();
        }
    });
    
    // Add a clear button or way to clear multiple selections
    searchInput.addEventListener('focus', function() {
        if (selectedAudienceSegmentFromDropdown && selectedAudienceSegmentFromDropdown.length > 0) {
            // Show a hint that multiple items are selected
            this.placeholder = `${selectedAudienceSegmentFromDropdown.length} item(s) selected. Press Enter to add all.`;
        }
        showABVRDropdown();
    });
    // FIXED: Add proper click outside detection that doesn't interfere with dropdown clicks
    document.addEventListener('click', function(e) {
        // Check if click is outside both the search input and dropdown
        const isOutsideSearch = !searchInput.contains(e.target);
        const isOutsideDropdown = !dropdown.contains(e.target);
        
        // Only hide if click is outside both elements
        if (isOutsideSearch && isOutsideDropdown) {
            hideABVRDropdown();
            searchInput.placeholder = 'Search for audience segments by name...';
        }
    });
}

function showABVRDropdown() {
    const dropdown = document.getElementById('abvrSearchDropdown');
    if (!dropdown) return;
    if (audienceSegmentFromDropdown.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching audience segments found</div>';
    } else {
        dropdown.innerHTML = audienceSegmentFromDropdown.map((abvr, idx) => {
            // Check if this ABVR is already selected
            const isSelected = selectedAudienceSegmentFromDropdown && 
                selectedAudienceSegmentFromDropdown.some(selected => selected.abvr === abvr.abvr);
            
            const selectedClass = isSelected ? 'selected' : '';
            const checkmark = isSelected ? ' ✓' : '';
            
            return `
                <div class="search-dropdown-item ${selectedClass}" data-idx="${idx}">
                    <div class="abvr-dropdown-name">${abvr.name}${checkmark}</div>
                    <div class="abvr-dropdown-description">${abvr.description}</div>
                    <div class="abvr-dropdown-similarity">${(abvr.similarity * 100).toFixed(1)}%</div>
                    <div class="abvr-dropdown-code">ABVR: ${abvr.abvr}</div>
                </div>
            `;
        }).join('');
        const items = dropdown.querySelectorAll('.search-dropdown-item');
        items.forEach((item, idx) => {
            item.addEventListener('click', function(e) {
                // Prevent event bubbling to parent elements
                e.preventDefault();
                e.stopPropagation();
                selectABVRFromDropdown(audienceSegmentFromDropdown[idx]);
            });
        });
    }
    
    // Store results for reference
    dropdown._searchResults = audienceSegmentFromDropdown;
    dropdown.style.display = 'block';
}

function hideABVRDropdown() {
    const dropdown = document.getElementById('abvrSearchDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

function selectABVRFromDropdown(selectedABVR) {
    if (!selectedAudienceSegmentFromDropdown) {
        selectedAudienceSegmentFromDropdown = [];
    }
    
    // Check if already selected
    const isAlreadySelected = selectedAudienceSegmentFromDropdown.some(
        item => item.abvr === selectedABVR.abvr
    );
    
    if (!isAlreadySelected) {
        selectedAudienceSegmentFromDropdown.push(selectedABVR);
        
        // Show success message
        showSuccessToast('Audience Segment Added', `Added "${selectedABVR.name}" to selection.`);
    } else {
        // Remove if already selected (toggle behavior)
        selectedAudienceSegmentFromDropdown = selectedAudienceSegmentFromDropdown.filter(
            item => item.abvr !== selectedABVR.abvr
        );
        
        showInfoToast('Audience Segment Removed', `Removed "${selectedABVR.name}" from selection.`);
    }
    
    // // Hide the dropdown after selection
    // hideABVRDropdown();
    
    // Update dropdown to show selection state
    updateABVRDropdownSelection();
    
    // Render the chips
    renderABVRChips();
    
    // Keep the search input focused so user can continue selecting
    const searchInput = document.getElementById('abvrSearch');
    if (searchInput) {
        searchInput.focus();
    }
}

// Add this new function to render ABVR chips
function renderABVRChips() {
    const container = document.getElementById('abvrChipsContainer');
    if (!container) return;
    
    if (!selectedAudienceSegmentFromDropdown || selectedAudienceSegmentFromDropdown.length === 0) {
        // Hide the container when no items are selected
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    
    // Show the container when items are selected
    container.style.display = 'block';
    
    container.innerHTML = `
        <div class="abvr-chips-label">Selected Audience Segments:</div>
        <div class="abvr-chips-list">
            ${selectedAudienceSegmentFromDropdown.map((abvr, idx) => `
                <span class="abvr-chip">
                    <span class="abvr-chip-name">${abvr.name}</span>
                    <span class="abvr-chip-similarity">${(abvr.similarity * 100).toFixed(1)}%</span>
                    <button class="remove-abvr-chip" onclick="removeABVRChip(${idx})">&times;</button>
                </span>
            `).join('')}
        </div>
    `;
}

// Add function to remove individual ABVR chips
function removeABVRChip(index) {
    if (selectedAudienceSegmentFromDropdown && selectedAudienceSegmentFromDropdown[index]) {
        const removedABVR = selectedAudienceSegmentFromDropdown[index];
        selectedAudienceSegmentFromDropdown.splice(index, 1);
        
        // Update dropdown selection state
        updateABVRDropdownSelection();
        
        // Re-render chips
        renderABVRChips();
        
        showInfoToast('Audience Segment Removed', `Removed "${removedABVR.name}" from selection.`);
    }
}

// Update the updateABVRDropdownSelection function to handle chips
function updateABVRDropdownSelection() {
    const dropdown = document.getElementById('abvrSearchDropdown');
    if (!dropdown || !dropdown._searchResults) return;
    
    const items = dropdown.querySelectorAll('.search-dropdown-item');
    items.forEach((item, idx) => {
        const abvr = dropdown._searchResults[idx];
        const isSelected = selectedAudienceSegmentFromDropdown && 
            selectedAudienceSegmentFromDropdown.some(selected => selected.abvr === abvr.abvr);
        
        if (isSelected) {
            item.classList.add('selected');
            item.innerHTML = `
                <div class="abvr-dropdown-name">${abvr.name} ✓</div>
                <div class="abvr-dropdown-description">${abvr.description}</div>
                <div class="abvr-dropdown-similarity">${(abvr.similarity * 100).toFixed(1)}%</div>
                <div class="abvr-dropdown-code">ABVR: ${abvr.abvr}</div>
            `;
        } else {
            item.classList.remove('selected');
            item.innerHTML = `
                <div class="abvr-dropdown-name">${abvr.name}</div>
                <div class="abvr-dropdown-description">${abvr.description}</div>
                <div class="abvr-dropdown-similarity">${(abvr.similarity * 100).toFixed(1)}%</div>
                <div class="abvr-dropdown-code">ABVR: ${abvr.abvr}</div>
            `;
        }
    });
}

async function addSelectedABVR() {
    if (!selectedAudienceSegmentFromDropdown || selectedAudienceSegmentFromDropdown.length === 0) {
        showErrorToast(
            'No Audience Segments Selected',
            'Please choose at least one audience segment from the dropdown before adding.'
        );
        return;
    }

    // Normalize to array
    const selection = Array.isArray(selectedAudienceSegmentFromDropdown)
        ? selectedAudienceSegmentFromDropdown
        : [selectedAudienceSegmentFromDropdown];

    // Collect all existing abvrs across groups
    const cohort_abvrs = (currentData.cohort_abvrs || []).map(a => a.abvr);
    const abvrs = (currentData.abvrs || []).map(a => a.abvr);
    const left_abvrs = (currentData.left_abvrs || []).map(a => a.abvr);
    const all_abvrs = new Set([...cohort_abvrs, ...abvrs, ...left_abvrs]);

    const selected_abvrs = selection.map(a => a.abvr);

    // Find which ones are actually new
    const new_abvrs = selection.filter(a => !all_abvrs.has(a.abvr));
    const already_selected = selection.filter(a => all_abvrs.has(a.abvr));

    // Update left_abvrs with new items
    let updated_left_abvrs = [
        ...(currentData.left_abvrs || []),
        ...new_abvrs.map(a => ({
            abvr: a.abvr,
            name: a.name,
            description: a.description,
            similarity: a.similarity,
            checked: true
        }))
    ];

    // Update "checked" status in cohort_abvrs and abvrs
    const markChecked = (arr) =>
        arr.map(a =>
            selected_abvrs.includes(a.abvr) && !a.checked
                ? { ...a, checked: true }
                : a
        );

    currentData.cohort_abvrs = markChecked(currentData.cohort_abvrs || []);
    
    // Also update cohort_auds
    if (currentData.cohort_auds) {
        for (const cohortName in currentData.cohort_auds) {
            if (Array.isArray(currentData.cohort_auds[cohortName])) {
                currentData.cohort_auds[cohortName] = currentData.cohort_auds[cohortName].map(a =>
                    selected_abvrs.includes(a.abvr) && !a.checked
                        ? { ...a, checked: true }
                        : a
                );
            }
        }
    }
    
    currentData.abvrs = markChecked(currentData.abvrs || []);

    // Sort by similarity descending
    updated_left_abvrs.sort((a, b) => b.similarity - a.similarity);
    currentData.left_abvrs = updated_left_abvrs;

    // Refresh UI
    displayEditableForm(currentData);

    // Reset dropdown & search
    selectedAudienceSegmentFromDropdown = [];
    const abvrSearchInput = document.getElementById('abvrSearch');
    if (abvrSearchInput) abvrSearchInput.value = '';

    // Clear the chips
    renderABVRChips();

    // Close dropdown
    hideABVRDropdown();

    // Toast message
    if (new_abvrs.length > 0 && already_selected.length > 0) {
        showSuccessToast(
            'Audience Segments Updated',
            `Added ${new_abvrs.length} new segment(s). ${already_selected.length} were already selected.`
        );
    } else if (new_abvrs.length > 0) {
        showSuccessToast(
            'Audience Segments Added',
            `Added ${new_abvrs.length} new segment(s) successfully.`
        );
    } else {
        showInfoToast(
            'No New Segments',
            'All selected audience segments were already part of your list.'
        );
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
});
// Locations Not Resolved Functions
function displayLocationsNotFound(locationsNotFound) {
    const section = document.getElementById('locationsNotFoundSection');
    const list = document.getElementById('locationsNotFoundList');
    
    if (!section || !list) return;
    
    // Clear previous content
    list.innerHTML = '';
    if(locationsNotFound.length==0){
        section.classList.add('d-none');
        return;
    }
    
    // Display as comma-separated string with good visual styling
    const locationsString = locationsNotFound.join(', ');
    list.innerHTML = `
        <div class="locations-not-found-display">
            <div class="locations-not-found-text">${locationsString}</div>
        </div>
    `;
    
    // Show the section
    section.classList.remove('d-none');
}

function toggleLocationMode() {
    const toggle = document.getElementById('locationModeToggle');
    const singleSection = document.getElementById('singleLocationSection');
    const groupSection = document.getElementById('locationGroupSection');
    const modalTitle = document.getElementById('modalTitle');
    const saveButton = document.getElementById('modalSaveButton');
    const toggleText = document.querySelector('.toggle-text');
    
    if (toggle.checked) {
        // Single location mode
        singleSection.classList.remove('d-none');
        groupSection.classList.add('d-none');
        modalTitle.textContent = 'Add Single Location to Database';
        saveButton.textContent = 'Save Single Location';
        toggleText.textContent = 'Single Location';
    } else {
        // Location group mode
        singleSection.classList.add('d-none');
        groupSection.classList.remove('d-none');
        modalTitle.textContent = 'Add Location Group to Database';
        saveButton.textContent = 'Save Location Group';
        toggleText.textContent = 'Location Group';
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
    const nameParts = location.name.split(",");
    const name = nameParts.slice(0, -1).join(",");
    const id = location.id;
    modalSingleLocation = {name: name, id: id};
    document.getElementById('modalSingleLocationSearch').value = '';
    document.getElementById('modalSingleLocationDropdown').style.display = 'none';
    renderModalSingleLocationChip();
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
        return;
    }
    
    container.innerHTML = '';
    
    if (modalSingleLocation) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
            <span>${modalSingleLocation.name}</span>
            <span class="remove-chip" onclick="removeModalSingleLocationChip()">&times;</span>
        `;
        container.appendChild(chip);
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

async function saveLocationGroup(locationGroupObj) {
    const nameAsId = locationGroupObj.nameAsId;
    try {
        // Prepare the location group data
        const locationGroupData = {
            name: nameAsId,
            includedLocationIds: locationGroupObj.includedLocations.map(loc => loc.id),
            excludedLocationIds: locationGroupObj.excludedLocations.map(loc => loc.id)
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
            console.log('Location group saved successfully');
        } else {
            console.error('Error saving location group:', response.statusText);
        }
    } catch (err) {
        console.error('Error saving location group:', err);
    }
}

function removeLocationFromNotFoundList(locationName) {
    // Remove from currentData if it exists
    if (currentData && currentData.locations_not_found) {
        currentData.locations_not_found = currentData.locations_not_found.filter(
            loc => loc !== locationName
        );
    }
    
    // Re-render the display with updated data
    if (currentData && currentData.locations_not_found) {
        displayLocationsNotFound(currentData.locations_not_found);
    }
}
