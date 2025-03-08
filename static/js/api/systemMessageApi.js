// api/systemMessageApi.js
export class SystemMessageApi {
    static async getSystemMessages() {
        try {
            const response = await fetch('/api/system-messages');
            if (!response.ok) {
                throw new Error('Failed to fetch system messages');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching system messages:', error);
            throw error;
        }
    }

    static async getSystemMessageCategories() {
        try {
            const response = await fetch('/api/system-messages/categories');
            if (!response.ok) {
                throw new Error('Failed to fetch system message categories');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching system message categories:', error);
            throw error;
        }
    }

    static async getSystemMessagesByCategory(category) {
        try {
            const response = await fetch(`/api/system-messages/category/${encodeURIComponent(category)}`);
            if (!response.ok) {
                throw new Error('Failed to fetch system messages for category');
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching system messages for category ${category}:`, error);
            throw error;
        }
    }
}
