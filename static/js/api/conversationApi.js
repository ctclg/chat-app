// api/conversationApi.js
export class ConversationApi {
    static async getAll() {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No authentication token found');

            const response = await fetch('/api/conversations', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch conversations');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching conversations:', error);
            throw error;
        }
    }

    static async getById(id) {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No authentication token found');

            const response = await fetch(`/api/conversation/${id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch conversation');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching conversation:', error);
            throw error;
        }
    }

    static async save(name, folder, messages) {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('No authentication token found');

        const currentId = localStorage.getItem('currentConversationId');
        const endpoint = currentId 
            ? `${API_ENDPOINTS.CONVERSATIONS}/${currentId}`
            : API_ENDPOINTS.CONVERSATIONS;

        try {
            const response = await fetch(endpoint, {
                method: currentId ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, folder, messages })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save conversation');
            }

            return await response.json();
        } catch (error) {
            console.error('Error saving conversation:', error);
            throw error;
        }
    }

    static async delete(id) {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No authentication token found');

            const response = await fetch(`/api/conversations/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete conversation');
            }

            return await response.json();
        } catch (error) {
            console.error('Error deleting conversation:', error);
            throw error;
        }
    }

    static async rename(id, newName) {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No authentication token found');

            const response = await fetch(`/api/rename-conversation/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newName })
            });

            if (!response.ok) {
                throw new Error('Failed to rename conversation');
            }

            return await response.json();
        } catch (error) {
            console.error('Error renaming conversation:', error);
            throw error;
        }
    }

    static async checkExists(name, folder) {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No authentication token found');

            const response = await fetch('/api/conversations/check', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, folder })
            });

            if (!response.ok) {
                throw new Error('Failed to check conversation');
            }

            return await response.json();
        } catch (error) {
            console.error('Error checking conversation:', error);
            throw error;
        }
    }
}