// utils/helpers.js
export const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const escapeHTML = (html) => {
    const text = document.createTextNode(html);
    const div = document.createElement('div');
    div.appendChild(text);
    return div.innerHTML;
};

export const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const showLoadingOverlay = (container, message = 'Loading...') => {
    if (!container) return null;
    
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
        <div class="loading-spinner">
            ${message}
        </div>
    `;
    container.appendChild(overlay);
    return overlay;
};

export const removeLoadingOverlay = (overlay) => {
    if (overlay && overlay.parentElement) {
        overlay.parentElement.removeChild(overlay);
    }
};