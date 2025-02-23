// api/folderApi.js
export class FolderApi {
    static async getFolders() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return [];

            const response = await fetch('/api/folders', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch folders');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching folders:', error);
            return [];
        }
    }
}