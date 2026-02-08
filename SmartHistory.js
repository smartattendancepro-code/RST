export const SmartHistory = {
    get: (key) => {
        try { 
            return JSON.parse(localStorage.getItem(key) || "[]"); 
        } 
        catch (e) { 
            return []; 
        }
    },

    push: (key, value) => {
        if (!value) return;

        let list = SmartHistory.get(key);
        
        const cleanValue = value.replace("🕒 ", "").trim();
        
        list = list.filter(item => item !== cleanValue);
        
        list.unshift(cleanValue);
        
        if (list.length > 3) list.pop();
        
        localStorage.setItem(key, JSON.stringify(list));
    }
};