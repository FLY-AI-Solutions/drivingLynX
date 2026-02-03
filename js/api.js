const API_URL = "https://jerin-api.flyai.online/x003/api";

const api = {
    // --- Auth ---
    async register(payload) {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).detail);
        return res.json();
    },

    async login(email, password) {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!res.ok) throw new Error("Invalid credentials");
        return res.json();
    },

    // --- STRIPE CONNECT (NEW) ---
    async createOnboardingLink(userId) {
        const res = await fetch(`${API_URL}/stripe/onboard?current_user_id=${userId}`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error("Could not create onboarding link.");
        return res.json();
    },
    
    // Check if onboarding is done (for dashboard reload)
    async checkStripeStatus(userId) {
        const res = await fetch(`${API_URL}/stripe/status/${userId}`);
        return res.json();
    },

    // --- Search & Profiles ---
    async getMentors(zip, rate) {
        let url =(`${API_URL}/mentors?`);
        if (zip) url += `zip_code=${zip}&`;
        if (rate) url += `max_rate=${rate}&`;
        const res = await fetch(url);
        return res.json();
    },

    async getMentorDetails(id) {
        const res = await fetch(`${API_URL}/mentors/${id}`);
        if (!res.ok) throw new Error("Failed to load mentor");
        return res.json();
    },

    // --- User Profile Update (For Helping Mode) ---
    async updateUser(userId, data) {
        // Note: You need to implement this endpoint in backend or reuse availability
        // For now, we reuse availability endpoint if it supports partial updates, 
        // OR we create a specific one. 
        // Assuming /api/users/{id} PATCH exists or similar.
        // Since backend might not have generic update, we'll try a specific endpoint pattern
        // or you might need to add it to backend: @app.patch("/api/users/{user_id}")
        
        const res = await fetch(`${API_URL}/users/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error("Failed to update profile");
        return res.json();
    },

    // --- Scheduling & Payments ---
    async getUpcoming(userId, role) {
        const res = await fetch(`${API_URL}/sessions/upcoming?user_id=${userId}&role=${role}`);
        return res.json();
    },

    async getRequests(userId) {
        const res = await fetch(`${API_URL}/requests/${userId}`);
        return res.json();
    },

    async createBookingIntent(payload) {
        const res = await fetch(`${API_URL}/bookings/create_intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Booking failed");
        }
        return res.json();
    },

    async handleRequestAction(sessionId, mentorId, action) {
        const res = await fetch(`${API_URL}/bookings/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, mentor_id: mentorId, action: action })
        });
        if (!res.ok) throw new Error("Action failed");
        return res.json();
    },

    // --- Session & QR ---
    async getSessionStatus(sessionId) {
        const res = await fetch(`${API_URL}/sessions/${sessionId}`);
        return res.json();
    },

    async getQRToken(sessionId, userId) {
        const res = await fetch(`${API_URL}/sessions/${sessionId}/qr_token?current_user_id=${userId}`);
        if (!res.ok) throw new Error((await res.json()).detail);
        return res.json();
    },

    async scanQR(userId, qrString) {
        const res = await fetch(`${API_URL}/sessions/scan?current_user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_string: qrString })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        return data;
    },

    // --- Availability & Reviews ---
    async updateAvailability(userId, availability) {
        const res = await fetch(`${API_URL}/availability/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, availability })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Availability update failed");
        }
        return res.json();
    },

    async saveEvaluation(sessionId, userId, data) {
        const res = await fetch(`${API_URL}/sessions/${sessionId}/evaluate?current_user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evaluation_json: data })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Evaluation save failed");
        }
        return res.json();
    },

    async submitRating(sessionId, userId, rating, comment) {
        const res = await fetch(`${API_URL}/sessions/${sessionId}/rate?current_user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating, comment })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Rating submit failed");
        }
        return res.json();
    }
};

