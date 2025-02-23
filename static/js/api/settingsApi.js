// api/settingsApi.js
export class SettingsApi {
    static async getModels() {
        try {
            const response = await fetch('/api/models');
            if (!response.ok) {
                throw new Error('Failed to fetch models');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching models:', error);
            throw error;
        }
    }

    static async updateSettings(settings) {
        try {
            const response = await fetch('/update-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            if (!response.ok) {
                throw new Error('Failed to update settings');
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating settings:', error);
            throw error;
        }
    }

    static async getDefaultSettings() {
        try {
            const response = await fetch('/settings');
            if (!response.ok) {
                throw new Error('Failed to fetch default settings');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching default settings:', error);
            throw error;
        }
    }
}