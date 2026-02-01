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

    // --- Scheduling ---
    async getUpcoming(userId, role) {
        const res = await fetch(`${API_URL}/sessions/upcoming?user_id=${userId}&role=${role}`);
        return res.json();
    },

    async createBooking(payload) {
        const res = await fetch(`${API_URL}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Booking failed");
        return res.json();
    },

    async confirmPayment(payload) {
        return fetch(`${API_URL}/payment/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    // --- Availability ---
    async updateAvailability(userId, availability) {
        return fetch(`${API_URL}/availability/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, availability })
        });
    },

    // --- Session & QR ---
    async getSessionStatus(sessionId) {
        const res = await fetch(`${API_URL}/sessions/${sessionId}`);
        if(res.ok) return res.json();
        throw new Error("Session fetch failed");
    },

    async getQRToken(sessionId, userId) {
        const res = await fetch(`${API_URL}/sessions/${sessionId}/qr_token?current_user_id=${userId}`);
        if (!res.ok) throw new Error("Could not generate token");
        return res.json();
    },

    async scanQR(userId, qrString) {
        const res = await fetch(`${API_URL}/sessions/scan?current_user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_string: qrString })
        });
        if (!res.ok) throw new Error((await res.json()).detail);
        return res.json();
    },

    // --- Evaluation ---
    async saveEvaluation(sessionId, userId, data) {
        return fetch(`${API_URL}/sessions/${sessionId}/evaluate?current_user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evaluation_json: data })
        });
    },

    async submitRating(sessionId, userId, rating, comment) {
        return fetch(`${API_URL}/sessions/${sessionId}/rate?current_user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating, comment })
        });
    },

    // --- Requests (Mentor View) ---
    async getRequests(mentorId) {
        const res = await fetch(`${API_URL}/requests/${mentorId}`);
        return res.json();
    },

    async handleRequestAction(sessionId, mentorId, action) {
        return fetch(`${API_URL}/bookings/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, mentor_id: mentorId, action })
        });
    }
};

const storage = {
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } },
    get: (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch (e) { return null } },
    remove: (k) => { try { localStorage.removeItem(k) } catch (e) { } }
};
