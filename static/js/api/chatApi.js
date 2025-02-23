// api/chatApi.js
export class ChatApi {
    static async sendMessage(message, conversationHistory) {
        try {
            const formData = new FormData();
            formData.append('message', message);
            formData.append('conversation', JSON.stringify(conversationHistory));

            const response = await fetch('/chat', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            return await response.json();
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    static async sendFeedback(message, feedbackType) {
        try {
            const response = await fetch('/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    feedback: feedbackType
                })
            });

            if (!response.ok) {
                throw new Error('Failed to send feedback');
            }

            return await response.json();
        } catch (error) {
            console.error('Error sending feedback:', error);
            throw error;
        }
    }
}