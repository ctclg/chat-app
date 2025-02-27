// components/settings.js
import { DEFAULT_SETTINGS } from '../utils/constants.js';
import { SettingsApi } from '../api/settingsApi.js';

export class Settings {
    constructor() {
        this.modal = document.getElementById('settings-modal');
        this.modelSelect = document.getElementById('model-select');
        this.systemPrompt = document.getElementById('system-prompt');
        this.temperature = document.getElementById('temperature');
        this.maxTokens = document.getElementById('max-tokens');
        
        this.init();
        this.initializeElements();
    }

    initializeElements() {
        this.modal = document.getElementById('settings-modal');
        this.modelSelect = document.getElementById('model-select');
        this.systemPrompt = document.getElementById('system-prompt');
        this.temperature = document.getElementById('temperature');
        this.maxTokens = document.getElementById('max-tokens');

        // Check if elements exist
        if (!this.modal || !this.modelSelect || !this.systemPrompt || 
            !this.temperature || !this.maxTokens) {
            console.error('Required settings elements not found');
            return;
        }
    }

    async init() {
        if (!this.modal) return; // Don't initialize if elements aren't found
        await this.loadModels();
        await this.loadSettings(false);
        this.setupEventListeners();
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
    }

    async loadModels() {
        this.modelSelect.disabled = true;
        try {
            const response = await fetch('/api/models');
            if (!response.ok) {
                throw new Error('Failed to fetch models');
            }
            const models = await response.json();
            this.modelSelect.innerHTML = '';

            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                option.dataset.systemPromptSupported = model.system_prompt_supported;
                this.modelSelect.appendChild(option);
            });

            await this.loadSettings(false);
        } catch (error) {
            console.error('Error loading models:', error);
            this.modelSelect.innerHTML = '<option disabled>Error loading models</option>';
        } finally {
            this.modelSelect.disabled = false;
        }
    }

    handleModelChange() {
        if (!this.modelSelect) return;
        
        const selectedOption = this.modelSelect.querySelector('option:checked');
        const systemPromptArea = this.systemPrompt;
        const overlay = document.querySelector('#system-prompt-overlay');

        if (!selectedOption || !systemPromptArea || !overlay) {
            console.error('Required elements for model change not found');
            return;
        }

        if (selectedOption.dataset.systemPromptSupported === 'Yes') {
            systemPromptArea.disabled = false;
            overlay.style.display = 'none';
        } else {
            systemPromptArea.disabled = true;
            overlay.style.display = 'flex';
        }
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
            // const response = await fetch('/update-settings', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(settings)
            // });
            // if (response.ok) {
            //     this.saveSettings(settings);
            //     this.modal.style.display = "none";
            //     document.getElementById('message-input').focus();
            // } else {
            //     throw new Error('Failed to update settings');
            // }
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

            // const response = await fetch('/update-settings', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(defaultSettings)
            // });

            // if (response.ok) {
            //     this.saveSettings(defaultSettings);
            //     this.applySettings(defaultSettings);
            //     if (showConfirmation) {
            //         this.modal.style.display = "none";
            //         document.getElementById('message-input').focus();
            //     }
            // } else {
            //     throw new Error('Failed to restore default settings');
            // }
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