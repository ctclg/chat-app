// components/settings.js
import { DEFAULT_SETTINGS } from '../utils/constants.js';
import { SettingsApi } from '../api/settingsApi.js';
import { SystemMessageApi } from '../api/systemMessageApi.js';

export class Settings {
    constructor() {
        this.modal = document.getElementById('settings-modal');
        this.modelSelect = document.getElementById('model-select');
        this.systemPrompt = document.getElementById('system-prompt');
        this.temperature = document.getElementById('temperature');
        this.maxTokens = document.getElementById('max-tokens');
        

        this.modelSelectButton = null;
        this.modelDropdown = null;
        this.selectedModelDisplay = null;
        this.modelOptionsContainer = null;


        this.init();
        this.initializeElements();
    }

    initializeElements() {
        this.modal = document.getElementById('settings-modal');
        this.modelSelect = document.getElementById('model-select');
        this.systemPrompt = document.getElementById('system-prompt');
        this.temperature = document.getElementById('temperature');
        this.maxTokens = document.getElementById('max-tokens');
        
        // New elements for custom dropdown
        this.modelSelectButton = document.getElementById('model-select-button');
        this.modelDropdown = document.getElementById('model-dropdown');
        this.selectedModelDisplay = document.getElementById('selected-model-display');
        this.modelOptionsContainer = document.getElementById('model-options-container');


        // Check if elements exist
        if (!this.modal || !this.modelSelect || !this.systemPrompt || 
            !this.temperature || !this.maxTokens ||
            !this.modelSelectButton || !this.modelDropdown || 
            !this.selectedModelDisplay || !this.modelOptionsContainer) {
            console.error('Required settings elements not found');
            return;
        }
    }

    async init() {
        if (!this.modal) return; // Don't initialize if elements aren't found
        await this.loadModels();
        await this.loadSettings(false);
        this.setupEventListeners();
        this.setupSystemMessagePresets();
    }

    setupEventListeners() {
        // Settings modal controls
        document.getElementById('toggle-settings').onclick = async () => {
            this.modal.style.display = "block";
            await this.loadModels();
        };

        document.getElementsByClassName('close')[0].onclick = () => {
            this.modal.style.display = "none";
            document.getElementById('message-input').focus();
        };

        // Close on ESC key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.modal.style.display === "block") {
                this.modal.style.display = "none";
                document.getElementById('message-input').focus();
            }
        });

        // Form submission
        document.getElementById('settings-form').addEventListener('submit', 
            (e) => this.handleSubmit(e));

        // Model change handler
        this.modelSelect.addEventListener('change', 
            () => this.handleModelChange());

        // Restore defaults
        document.getElementById('restore-defaults').addEventListener('click', 
            () => this.restoreDefaults(true));

        // System message preset selector
        document.getElementById('system-preset-select').addEventListener('change', 
            (e) => this.handleSystemPresetChange(e));

        // Add custom dropdown event listeners
        if (this.modelSelectButton) {
            this.modelSelectButton.addEventListener('click', () => this.toggleModelDropdown());
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!this.modelSelectButton.contains(e.target) && 
                    !this.modelDropdown.contains(e.target)) {
                    this.modelDropdown.style.display = 'none';
                    this.modelSelectButton.querySelector('.dropdown-arrow').style.transform = 'rotate(0deg)';
                }
            });
        }
    }

    toggleModelDropdown() {
        const isVisible = this.modelDropdown.style.display === 'block';
        this.modelDropdown.style.display = isVisible ? 'none' : 'block';
        
        // Rotate arrow
        const arrow = this.modelSelectButton.querySelector('.dropdown-arrow');
        arrow.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    async setupSystemMessagePresets() {
        try {
            const presetSelector = document.getElementById('system-preset-select');
            if (!presetSelector) return;

            // Clear existing options
            presetSelector.innerHTML = '<option value="">Select a preset...</option>';
            
            // Fetch categories
            const categories = await SystemMessageApi.getSystemMessageCategories();
            
            // Create optgroups for each category
            for (const category of categories) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category;
                
                // Fetch messages for this category
                const messages = await SystemMessageApi.getSystemMessagesByCategory(category);
                
                // Add options for each message
                messages.forEach(msg => {
                    const option = document.createElement('option');
                    option.value = msg.id;
                    option.textContent = msg.name;
                    option.dataset.message = msg.message;
                    option.dataset.description = msg.description;
                    optgroup.appendChild(option);
                });
                
                presetSelector.appendChild(optgroup);
            }
        } catch (error) {
            console.error('Error setting up system message presets:', error);
        }
    }

    handleSystemPresetChange(event) {
        const selectedOption = event.target.options[event.target.selectedIndex];
        const systemPrompt = document.getElementById('system-prompt');
        const presetDescription = document.getElementById('preset-description');
        
        if (selectedOption.value === 'custom' || !selectedOption.value) {
            presetDescription.textContent = 'Optionally select message from presets below.';
            return;
        }
        
        // Update the system prompt with the selected preset
        systemPrompt.value = selectedOption.dataset.message || '';
        
        // Show description if available
        if (selectedOption.dataset.description) {
            presetDescription.textContent = selectedOption.dataset.description;
        }
    }

    async loadModels() {
        try {
            // Disable the button during loading
            if (this.modelSelectButton) {
                this.modelSelectButton.disabled = true;
            }
            
            const models = await SettingsApi.getModels();
            
            // Clear both the hidden select and the visible options container
            this.modelSelect.innerHTML = '';
            this.modelOptionsContainer.innerHTML = '';

            models.forEach(model => {
                // Add to hidden select for form submission
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                
                // Store all model metadata as data attributes
                option.dataset.systemPromptSupported = model.system_prompt_supported;
                option.dataset.vendor = model.vendor;
                option.dataset.contextWindow = model.context_window;
                option.dataset.maxOutputTokens = model.max_output_tokens;
                option.dataset.knowledgeCutoff = model.knowledge_cutoff;
                option.dataset.costInput = model.cost_per_1m_tokens_input;
                option.dataset.costOutput = model.cost_per_1m_tokens_output;
                option.dataset.description = model.short_description;
                option.dataset.longDescription = model.long_description;
                
                this.modelSelect.appendChild(option);
                
                // Create visible option row
                const modelOption = document.createElement('div');
                modelOption.className = 'model-option';
                modelOption.dataset.value = model.value;
                
                // Format cost display
                const costInput = parseFloat(model.cost_per_1m_tokens_input) || 0;
                const costOutput = parseFloat(model.cost_per_1m_tokens_output) || 0;
                const costDisplay = `$${costInput} in / $${costOutput} out`;
                
                // Create the four columns
                modelOption.innerHTML = `
                    <div class="model-column vendor">${model.vendor || 'Unknown'}</div>
                    <div class="model-column name">${model.label}</div>
                    <div class="model-column cost">${costDisplay}</div>
                    <div class="model-column cutoff">${model.knowledge_cutoff || 'N/A'}</div>
                `;
                
                // Add click handler
                modelOption.addEventListener('click', () => {
                    this.selectModel(model.value);
                });
                
                this.modelOptionsContainer.appendChild(modelOption);
            });

            await this.loadSettings(false);
        } catch (error) {
            console.error('Error loading models:', error);
            this.modelOptionsContainer.innerHTML = '<div class="model-option">Error loading models</div>';
        } finally {
            if (this.modelSelectButton) {
                this.modelSelectButton.disabled = false;
            }
        }
    }

    selectModel(value) {
        // Update hidden select
        this.modelSelect.value = value;
        
        // Update visible selected item
        const selectedOption = this.modelSelect.querySelector(`option[value="${value}"]`);
        if (selectedOption) {
            this.selectedModelDisplay.textContent = selectedOption.textContent;
            
            // Update selected class in dropdown
            const options = this.modelOptionsContainer.querySelectorAll('.model-option');
            options.forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.value === value);
            });
            
            // Close dropdown
            this.modelDropdown.style.display = 'none';
            this.modelSelectButton.querySelector('.dropdown-arrow').style.transform = 'rotate(0deg)';
            
            // Trigger model change handler
            this.handleModelChange();
        }
    }

    updateModelInfo() {
        if (!this.modelSelect) return;
        
        const selectedOption = this.modelSelect.querySelector('option:checked');
        const costInfo = document.getElementById('cost-info');
        
        if (!selectedOption || !costInfo) return;
        
        // Get model information from data attributes
        const vendor = selectedOption.dataset.vendor || 'Unknown';
        const contextWindow = selectedOption.dataset.contextWindow || 'Unknown';
        const maxOutputTokens = selectedOption.dataset.maxOutputTokens || 'Unknown';
        const costInput = selectedOption.dataset.costInput || 'Unknown';
        const costOutput = selectedOption.dataset.costOutput || 'Unknown';
        const description = selectedOption.dataset.description || '';
        const knowledgeCutoff = selectedOption.dataset.knowledgeCutoff || 'N/A';
        
        // Format cost information
        let costInfoText = `<strong>${description}</strong><br>`;
        costInfoText += `Vendor: ${vendor} | Context: ${Number(contextWindow).toLocaleString()} tokens | Max Output: ${Number(maxOutputTokens).toLocaleString()} tokens<br>`;
        costInfoText += `Cost: $${costInput} per 1M input tokens | $${costOutput} per 1M output tokens | Knowledge Cutoff: ${knowledgeCutoff}`;
        
        costInfo.innerHTML = costInfoText;
    }

    handleModelChange() {
        if (!this.modelSelect) return;
        
        const selectedOption = this.modelSelect.querySelector('option:checked');
        const systemPromptArea = this.systemPrompt;
        const overlay = document.querySelector('#system-prompt-overlay');
        const presetSelector = document.getElementById('system-preset-select');

        if (!selectedOption || !systemPromptArea || !overlay) {
            console.error('Required elements for model change not found');
            return;
        }

        const systemPromptSupported = selectedOption.dataset.systemPromptSupported === 'Yes';
        
        // Update system prompt field
        systemPromptArea.disabled = !systemPromptSupported;
        overlay.style.display = systemPromptSupported ? 'none' : 'flex';
        
        // Update preset selector
        if (presetSelector) {
            presetSelector.disabled = !systemPromptSupported;
        }
        
        // Update model information display
        this.updateModelInfo();
    }

    async loadSettings(showConfirmation = false) {
        const settings = localStorage.getItem('chatSettings');
        if (settings) {
            try {
                const parsedSettings = JSON.parse(settings);
                this.applySettings(parsedSettings);
            } catch (e) {
                console.error('Error loading settings:', e);
                await this.restoreDefaults(showConfirmation);
            }
        } else {
            // If no settings exist, quietly restore defaults without confirmation
            await this.restoreDefaults(false);
        }
    }

    applySettings(settings) {
        if (!this.modelSelect || !this.systemPrompt || 
            !this.temperature || !this.maxTokens) return;

        this.modelSelect.value = settings.model || DEFAULT_SETTINGS.model;
        this.systemPrompt.value = settings.system_prompt || DEFAULT_SETTINGS.system_prompt;
        this.temperature.value = settings.temperature || DEFAULT_SETTINGS.temperature;
        this.maxTokens.value = settings.max_tokens || DEFAULT_SETTINGS.max_tokens;
        
        // Update the visible selected model display
        if (this.selectedModelDisplay) {
            const selectedOption = this.modelSelect.querySelector('option:checked');
            if (selectedOption) {
                this.selectedModelDisplay.textContent = selectedOption.textContent;
                
                // Update selected class in dropdown
                const options = this.modelOptionsContainer.querySelectorAll('.model-option');
                options.forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.value === settings.model);
                });
            }
        }
        
        // Reset preset selector
        const presetSelector = document.getElementById('system-preset-select');
        if (presetSelector) {
            presetSelector.value = '';
            document.getElementById('preset-description').textContent = 'Optionally select message from presets below.';
        }
        
        // Only call handleModelChange if elements exist
        if (this.modelSelect.querySelector('option:checked')) {
            this.handleModelChange();
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        const settings = {
            model: this.modelSelect.value,
            system_prompt: this.systemPrompt.value,
            temperature: parseFloat(this.temperature.value),
            max_tokens: parseInt(this.maxTokens.value),
            system_prompt_supported: this.modelSelect.querySelector('option:checked')
                .dataset.systemPromptSupported
        };

        try {
            this.saveSettings(settings);
            this.modal.style.display = "none";
            document.getElementById('message-input').focus();

        } catch (error) {
            console.error('Error updating settings:', error);
            alert('Error updating settings');
        }
    }

    async restoreDefaults(showConfirmation = true) {
        // Only show confirmation dialog if explicitly requested
        if (showConfirmation && !confirm('Are you sure you want to restore default settings?')) {
            return;
        }

        try {
            // First, fetch default settings from server
            const defaultSettings = await this.fetchDefaultSettings();
            
            this.saveSettings(defaultSettings);
            this.applySettings(defaultSettings);
            if (showConfirmation) {
              this.modal.style.display = "none";
              document.getElementById('message-input').focus();
            }

        } catch (error) {
            console.error('Error restoring defaults:', error);
            if (showConfirmation) {
                alert('Error restoring default settings');
            }
        }
    }

    async fetchDefaultSettings() {
        try {
            const response = await fetch('/settings');
            const data = await response.json();
            
            // Update DEFAULT_SETTINGS with the fetched values
            Object.assign(DEFAULT_SETTINGS, data);
            
            return DEFAULT_SETTINGS;
        } catch (error) {
            console.error('Error fetching settings:', error);
            return DEFAULT_SETTINGS;
        }
    }

    saveSettings(settings) {
        localStorage.setItem('chatSettings', JSON.stringify(settings));
        document.getElementById('selected-model').textContent = "Selected model: " + settings.model;
    }

    validateSettings(settings) {
        return {
            model: settings.model || DEFAULT_SETTINGS.model,
            system_prompt: settings.system_prompt || DEFAULT_SETTINGS.system_prompt,
            temperature: this.validateNumber(settings.temperature, DEFAULT_SETTINGS.temperature, 0, 2),
            max_tokens: this.validateNumber(settings.max_tokens, DEFAULT_SETTINGS.max_tokens, 1, 32000),
            system_prompt_supported: settings.system_prompt_supported || DEFAULT_SETTINGS.system_prompt_supported
        };
    }

    validateNumber(value, defaultValue, min, max) {
        const num = parseFloat(value);
        if (isNaN(num) || num < min || num > max) {
            return defaultValue;
        }
        return num;
    }
}
