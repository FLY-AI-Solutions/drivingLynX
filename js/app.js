const app = {
    state: {
        currentUser: null,
        selectedMentor: null,
        selectedSlots: [],
        activeSession: null,
        sessionPoller: null,
        tempSelectedDates: [],
        currentRating: 0,
        localAvailability: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        userRole: 'learner',
        hasCar: false,
        currentStep: 1,
        totalSteps: 4,
        scanner: null,
        stripe: null,
        cardElement: null,
        bookingServiceType: 'lesson',
        selectedServiceCode: null,
        serviceStatus: null
    },

    init() {
        setTimeout(() => document.getElementById('splash').style.transform = 'translateY(-100%)', 1000);
        this.handleDeepLink();
        const user = storage.get('lynx_user');
        if (user) {
            this.showDashboard(user);
            // Background check for updated stripe status
            if (user.role === 'mentor' && !user.stripe_onboarding_complete) {
                api.checkStripeStatus(user.id).then(status => {
                    if (status.details_submitted) {
                        user.stripe_onboarding_complete = true;
                        storage.set('lynx_user', user);
                        this.state.currentUser = user;
                        this.updatePayoutBadge(true);
                    }
                });
            }
        } else {
            this.ensureLoggedOutUI();
        }
        this.handleOnboardingReturn();
        this.initStripe();
    },

    initStripe() {
        if (window.Stripe) {
            this.state.stripe = Stripe('pk_test_TYooMQauvdEDq54NiTphI7jx'); // REPLACE WITH YOUR KEY
            const elements = this.state.stripe.elements();
            this.state.cardElement = elements.create('card', {
                style: {
                    base: {
                        color: "#ffffff",
                        fontFamily: '"Inter", sans-serif',
                        fontSmoothing: "antialiased",
                        fontSize: "16px",
                        "::placeholder": { color: "#aab7c4" }
                    },
                    invalid: { color: "#fa755a", iconColor: "#fa755a" }
                }
            });
        }
    },

    // --- PAYOUTS & HELPING MODE ---
    async startStripeOnboarding() {
        try {
            const data = await api.createOnboardingLink(this.state.currentUser.id);
            window.location.href = data.url; // Redirect to Stripe
        } catch (e) {
            alert("Error: " + e.message);
        }
    },

    async activateHelpingMode() {
        if (!confirm("Are you sure? Switching to Helping Mode sets your rate to $0 (Volunteer). You can change this later in settings.")) return;
        
        try {
            // Update rate to 0
            await api.updateUser(this.state.currentUser.id, { hourly_rate: 0 });
            
            // Update local state
            this.state.currentUser.hourly_rate = 0;
            storage.set('lynx_user', this.state.currentUser);
            
            // Refresh View
            alert("You are now a Volunteer! Helping Mode Active.");
            this.loadRequests(); 
        } catch (e) {
            alert("Could not update profile. (Backend endpoint for update might be missing)");
        }
    },

    // --- Auth ---
    async loginAction() {
        const emailEl = document.getElementById('loginEmail');
        const passEl = document.getElementById('loginPass');
        if (!emailEl || !passEl) {
            this.showToast("Login form not available.", "error");
            return;
        }
        const email = emailEl.value;
        const pass = passEl.value;
        try {
            const data = await api.login(email, pass);
            if (!data || !data.user) {
                throw new Error("Invalid login response");
            }
            storage.set('lynx_user', data.user);
            this.showDashboard(data.user);
            this.closeModal();
            if (this.state.pendingMentorId) {
                this.openMentorProfile(this.state.pendingMentorId);
                this.state.pendingMentorId = null;
            }
            this.updateVerificationMenu();
        } catch (e) {
            storage.remove('lynx_user');
            this.ensureLoggedOutUI();
            this.showToast(e.message || "Login failed", "error");
        }
    },

    async handleRegistration() {
        const btn = document.getElementById('nextBtn');
        if (!document.getElementById('regConsent').checked) return alert("Agree to terms required");
        btn.innerText = "Processing...";
        const licenseFile = document.getElementById('regLicenseImage')?.files?.[0];
        const licenseImage = licenseFile ? await this.readFileAsDataUrl(licenseFile) : null;
        const payload = {
            role: this.state.userRole,
            first_name: document.getElementById('regFirst').value,
            last_name: document.getElementById('regLast').value,
            email: document.getElementById('regEmail').value,
            password: document.getElementById('regPass').value,
            license_number: document.getElementById('regLicense').value,
            address: document.getElementById('regAddress').value,
            city: document.getElementById('regCity').value,
            state: "NY",
            zip_code: document.getElementById('regZip').value,
            hourly_rate: 0,
            has_car: this.state.hasCar,
            car_make_model: document.getElementById('regCarModel').value || null,
            car_plate: document.getElementById('regCarPlate').value || null,
            license_image: licenseImage,
            is_certified_instructor: !!document.getElementById('regCertifiedInstructor')?.checked
        };
        try {
            await api.register(payload);
            this.showOtpModal(payload.email);
        } catch (e) { alert(e.message); }
        btn.innerText = "FINISH REGISTRATION";
    },

    showDashboard(user) {
        this.state.currentUser = user;
        const landing = document.getElementById('landingView');
        const dashboard = document.getElementById('dashboardView');
        const authBtns = document.getElementById('navAuthButtons');
        const userArea = document.getElementById('navUserArea');
        const userName = document.getElementById('userNameDisplay');
        const roleBadge = document.getElementById('roleBadge');

        if (landing) landing.classList.add('hidden');
        if (dashboard) dashboard.classList.remove('hidden');
        if (authBtns) authBtns.classList.add('hidden');
        if (userArea) userArea.classList.remove('hidden');
        if (userName) userName.innerText = user.first_name;
        if (roleBadge) roleBadge.innerText = user.role;
        this.updatePayoutBadge(user.role === 'mentor' && user.stripe_onboarding_complete);

        if (user.role === 'mentor') {
            const tabFind = document.getElementById('tabFind');
            const tabRequests = document.getElementById('tabRequests');
            const tabAvail = document.getElementById('tabAvail');
            const tabUpcoming = document.getElementById('tabUpcoming');
            const tabRates = document.getElementById('tabRates');
            if (tabFind) tabFind.classList.add('hidden');
            if (tabRequests) tabRequests.classList.remove('hidden');
            if (tabAvail) tabAvail.classList.remove('hidden');
            if (tabUpcoming) tabUpcoming.classList.remove('hidden');
            if (tabRates) tabRates.classList.remove('hidden');
            this.switchTab('requests');
        } else {
            const tabFind = document.getElementById('tabFind');
            const tabRequests = document.getElementById('tabRequests');
            const tabAvail = document.getElementById('tabAvail');
            const tabUpcoming = document.getElementById('tabUpcoming');
            const tabRates = document.getElementById('tabRates');
            if (tabFind) tabFind.classList.remove('hidden');
            if (tabRequests) tabRequests.classList.add('hidden');
            if (tabAvail) tabAvail.classList.add('hidden');
            if (tabUpcoming) tabUpcoming.classList.remove('hidden');
            if (tabRates) tabRates.classList.add('hidden');
            this.switchTab('find');
            this.loadMentors();
        }
    },

    switchTab(tabId) {
        if (this.state.scanner) {
            this.state.scanner.clear();
            this.state.scanner = null;
        }
        if (tabId !== 'session' && this.state.sessionPoller) {
            clearInterval(this.state.sessionPoller);
            this.state.sessionPoller = null;
        }
        
        ui.switchTab(tabId, this.state.currentUser?.role);

        if (tabId === 'requests') this.loadRequests();
        if (tabId === 'upcoming') this.loadUpcoming();
        if (tabId === 'avail') this.showAvailabilityEditor();
        if (tabId === 'rates') this.loadLessonRates();
        if (tabId === 'policy') this.loadPolicy();
    },

    async loadRequests() {
        try {
            const data = await api.getRequests(this.state.currentUser.id);
            // Pass Current User to renderer so it can check onboarding status
            ui.renderRequests(data, this.state.currentUser);
        } catch (e) { }
    },

    // ... (Keep existing loadMentors, openMentorProfile, loadUpcoming, enterSessionMode, etc.) ...
    async loadMentors() {
        const zip = document.getElementById('filterZip').value;
        const rate = document.getElementById('filterRate').value;
        try {
            const data = await api.getMentors(zip, rate);
            ui.renderMentors(data);
        } catch (e) { }
    },

    async openMentorProfile(id) {
        try {
            const data = await api.getMentorDetails(id);
            this.state.selectedMentor = data;
            document.getElementById('viewFind').classList.add('hidden');
            document.getElementById('viewProfile').classList.remove('hidden');
            this.state.selectedSlots = [];
            document.getElementById('selectedCount').innerText = "0";
            ui.renderProfile(data, data.availability, []);
            document.getElementById('btnViewLicense').classList.toggle('hidden', !data.license_image);
        } catch (e) { alert(e.message); }
    },

    async loadUpcoming() {
        try {
            const data = await api.getUpcoming(this.state.currentUser.id, this.state.currentUser.role);
            ui.renderUpcoming(data);
        } catch (e) { document.getElementById('upcomingGrid').innerHTML = "Error loading schedule."; }
    },

    async enterSessionMode(sessionId) {
        if (!sessionId) return;
        document.getElementById('tabSession').classList.remove('hidden');
        try {
            const fresh = await api.getSessionStatus(sessionId);
            this.state.activeSession = fresh;
        } catch (e) {
            this.state.activeSession = { id: sessionId, status: 'scheduled' }; 
        }
        ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
        if (this.state.sessionPoller) clearInterval(this.state.sessionPoller);
        this.state.sessionPoller = setInterval(() => this.syncSessionStatus(), 5000);
        this.switchTab('session');
    },

    async syncSessionStatus() {
        if (!this.state.activeSession) return;
        try {
            const fresh = await api.getSessionStatus(this.state.activeSession.id);
            if (fresh.status !== this.state.activeSession.status) {
                this.state.activeSession = fresh;
                ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
            }
        } catch (e) { console.log(e); }
    },

    async generateQR() {
        try {
            const data = await api.getQRToken(this.state.activeSession.id, this.state.currentUser.id);
            const canvas = document.getElementById('qrCanvas');
            canvas.innerHTML = "";
            new QRCode(canvas, { text: data.qr_string, width: 180, height: 180 });
            document.getElementById('qrContainer').classList.remove('hidden');
            document.getElementById('btnGenerateQR').classList.add('hidden');
        } catch (e) { alert("Error: " + e.message); }
    },

    startScanner() {
        document.getElementById('scanContainer').classList.remove('hidden');
        document.getElementById('btnOpenScanner').classList.add('hidden');
        if(!document.getElementById('reader')) return alert("Scanner DOM error. Try refreshing.");
        try {
            if (!this.state.scanner) {
                this.state.scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
            }
            this.state.scanner.render(
                (decodedText) => this.handleScanSuccess(decodedText),
                (error) => { }
            );
        } catch (e) { alert("Camera failed. Check permissions."); }
    },

    async handleScanSuccess(qrString) {
        if (this.state.scanner) {
            this.state.scanner.clear();
            this.state.scanner = null;
        }
        try {
            const data = await api.scanQR(this.state.currentUser.id, qrString);
            alert(data.message);
            if (data.message.includes("Started") || data.message.includes("Active")) this.state.activeSession.status = 'active';
            if (data.message.includes("Ended")) this.state.activeSession.status = 'completed';
            ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
        } catch (e) { alert("Scan Failed: " + e.message); }
    },

    async processManualScan() {
        const token = document.getElementById('scanInput').value.trim();
        if (!token) return alert("Paste a token first.");
        this.handleScanSuccess(token);
    },
    
    toggleManualScanInput() {
        const input = document.getElementById('scanInput');
        const submit = document.getElementById('scanSubmitBtn');
        if (!input || !submit) return;
        const makeVisible = input.classList.contains('hidden');
        input.classList.toggle('hidden', !makeVisible);
        submit.classList.toggle('hidden', !makeVisible);
        if (makeVisible) input.focus();
    },

    async saveEvaluation() {
        const data = {
            steering: document.getElementById('evalSteering').checked,
            mirrors: document.getElementById('evalMirrors').checked,
            braking: document.getElementById('evalBraking').checked,
            signals: document.getElementById('evalSignals').checked
        };
        try {
            await api.saveEvaluation(this.state.activeSession.id, this.state.currentUser.id, data);
            alert("Evaluation Saved!");
        } catch (e) { alert("Save failed"); }
    },

    async submitRating() {
        if (this.state.currentRating === 0) return alert("Select stars");
        const comment = document.getElementById('ratingComment').value;
        try {
            await api.submitRating(this.state.activeSession.id, this.state.currentUser.id, this.state.currentRating, comment);
            alert("Rating Submitted!");
            this.exitSession();
        } catch (e) { alert("Submit failed"); }
    },

    exitSession() {
        if (this.state.scanner) { 
            this.state.scanner.clear(); 
            this.state.scanner = null; 
        }
        clearInterval(this.state.sessionPoller);
        this.state.activeSession = null;
        document.getElementById('tabSession').classList.add('hidden');
        this.switchTab('upcoming');
    },

    openDateModal(day, time) {
        this.state.tempSelectedDates = [...this.state.selectedSlots];
        const dates = ui.getNextFourDates(day, time);
        const container = document.getElementById('dateOptionsGrid');
        document.getElementById('dateModalTitle').innerText = `${day.toUpperCase()} @ ${time}`;

        container.innerHTML = dates.map(dateObj => {
            const iso = dateObj.toISOString().slice(0, 19);
            const isSelected = this.state.selectedSlots.some(s => s.startsWith(iso));
            return `
            <div onclick="app.toggleDateSelection('${iso}', this)" 
                 class="cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center ${isSelected ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}">
                <span class="font-bold">${ui.formatDateNice(dateObj)}</span>
                <div class="w-4 h-4 rounded-full border ${isSelected ? 'bg-black border-black' : 'border-gray-500'}"></div>
            </div>`;
        }).join('');
        document.getElementById('dateModal').classList.replace('hidden', 'flex');
    },

    toggleDateSelection(iso, el) {
        const idx = this.state.tempSelectedDates.findIndex(s => s.startsWith(iso));
        if (idx > -1) {
            this.state.tempSelectedDates.splice(idx, 1);
            el.className = 'cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center bg-white/5 border-white/10 text-gray-300 hover:bg-white/10';
            el.querySelector('div').className = 'w-4 h-4 rounded-full border border-gray-500';
        } else {
            this.state.tempSelectedDates.push(iso);
            el.className = 'cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center bg-white text-black border-white';
            el.querySelector('div').className = 'w-4 h-4 rounded-full border bg-black border-black';
        }
    },

    confirmDateSelection() {
        this.state.selectedSlots = [...this.state.tempSelectedDates];
        document.getElementById('selectedCount').innerText = this.state.selectedSlots.length;
        this.closeDateModal();
        if (this.state.selectedMentor) ui.renderCalendar(this.state.selectedMentor.availability, this.state.selectedSlots);
    },

    proceedToPayment() {
        if(this.state.selectedSlots.length === 0) return alert("Select at least one slot.");
        document.getElementById('viewProfile').classList.add('hidden');
        document.getElementById('viewPayment').classList.remove('hidden');

        this.state.bookingServiceType = 'lesson';
        const serviceSelect = document.getElementById('bookingServiceType');
        if (serviceSelect) {
            const transportOption = serviceSelect.querySelector('option[value="test_transport"]');
            if (transportOption) {
                transportOption.disabled = !(this.state.selectedMentor?.offers_test_transport);
            }
            serviceSelect.value = 'lesson';
            serviceSelect.onchange = () => {
                this.state.bookingServiceType = serviceSelect.value;
                this.refreshPaymentSummary();
                if (this.state.bookingServiceType === 'test_transport') this.loadStudentTransportDisclosure();
            };
        }
        this.refreshPaymentSummary();

        if (this.state.cardElement) {
            this.state.cardElement.mount('#card-element');
        }
    },

    computePlatformFee(subtotal) {
        const pct = subtotal * 0.05;
        return Math.min(15, Math.max(5, pct));
    },

    refreshPaymentSummary() {
        const count = this.state.selectedSlots.length;
        const rate = this.getCurrentLessonRate();
        const subtotal = count * rate;
        const fee = this.computePlatformFee(subtotal);
        const total = subtotal + fee;
        document.getElementById('payCount').innerText = count;
        document.getElementById('payRate').innerText = `$${rate.toFixed(2)}`;
        document.getElementById('paySubtotal').innerText = `$${subtotal.toFixed(2)}`;
        document.getElementById('payFees').innerText = `$${fee.toFixed(2)}`;
        document.getElementById('payTotal').innerText = `$${total.toFixed(2)}`;

        const isTransport = this.state.bookingServiceType === 'test_transport';
        document.getElementById('transportFields')?.classList.toggle('hidden', !isTransport);
        document.getElementById('studentTransportAckWrap')?.classList.toggle('hidden', !isTransport);
        document.getElementById('studentTransportDisclosure')?.classList.toggle('hidden', !isTransport);
    },

    async loadStudentTransportDisclosure() {
        const box = document.getElementById('studentTransportDisclosure');
        if (!box) return;
        box.innerText = "Loading legal disclosure...";
        try {
            const term = await api.getActiveLegalTerm("student_test_transport_terms");
            const clauses = Array.isArray(term.body) ? term.body : [];
            box.innerHTML = `
                <div class="font-bold text-white mb-1">${term.title} (Term ID: ${term.term_id})</div>
                <ul class="list-disc ml-5 space-y-1">${clauses.map(c => `<li>${c}</li>`).join('')}</ul>
            `;
        } catch (e) {
            box.innerText = "Unable to load legal disclosure.";
        }
    },

    getCurrentLessonRate() {
        const mentor = this.state.selectedMentor || {};
        if (this.state.bookingServiceType === 'test_transport') {
            return parseFloat(mentor.test_transport_rate || 0);
        }
        const hasCar = this.state.currentUser?.has_car;
        const rateWithoutCar = mentor.hourly_rate_without_car || 0;
        const rateWithCar = mentor.hourly_rate_with_car || 0;
        return hasCar ? rateWithoutCar : rateWithCar;
    },

    async submitBooking() {
        const btn = document.getElementById('btnSubmitPayment');
        btn.innerText = "Processing...";
        btn.disabled = true;

        try {
            let paymentMethodId = "pm_card_us"; // Default for helping mode
            const rate = this.getCurrentLessonRate();
            const serviceType = this.state.bookingServiceType || 'lesson';

            if (serviceType === 'test_transport') {
                const studentAck = document.getElementById('studentTransportAck');
                if (!studentAck?.checked) throw new Error("You must acknowledge test transport legal disclosure.");
                const studentTerm = await api.getActiveLegalTerm("student_test_transport_terms");
                await api.acknowledgeLegal({
                    user_id: this.state.currentUser.id,
                    ack_type: "student_test_transport_terms",
                    term_id: studentTerm.term_id,
                    accepted: true,
                    ack_meta: {
                        source: "booking_flow",
                        service_type: "test_transport",
                        disclosure_term_id: studentTerm.term_id
                    }
                });
            }

            // Only use Stripe if rate > 0
            if (rate > 0) {
                 const {paymentMethod, error} = await this.state.stripe.createPaymentMethod({
                    type: 'card',
                    card: this.state.cardElement,
                });
                if (error) {
                    document.getElementById('card-errors').textContent = error.message;
                    throw new Error(error.message);
                }
                paymentMethodId = paymentMethod.id;
            }

            const res = await api.createBookingIntent({
                mentor_id: this.state.selectedMentor.id,
                mentee_id: this.state.currentUser.id,
                datetime_slots: this.state.selectedSlots,
                payment_method_id: paymentMethodId,
                service_type: serviceType,
                pickup_address: document.getElementById('pickupAddress')?.value || null,
                dropoff_location: document.getElementById('dropoffLocation')?.value || null
            });

            if (res.error) throw new Error(res.error);

            alert("Booking Confirmed!");
            this.switchTab('find');

        } catch (e) {
            alert("Booking Error: " + e.message);
        } finally {
            btn.innerText = "AUTHORIZE PAYMENT & BOOK";
            btn.disabled = false;
        }
    },

    // --- Availability, Requests, Helpers ---
    showAvailabilityEditor() {
        if (this.state.currentUser.weekly_availability) {
            this.state.localAvailability = typeof this.state.currentUser.weekly_availability === 'string'
                ? JSON.parse(this.state.currentUser.weekly_availability)
                : this.state.currentUser.weekly_availability;
        }
        this.renderAvailabilityEditor();
    },

    renderAvailabilityEditor() {
        const container = document.getElementById('availabilityEditor');
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const times = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

        container.innerHTML = days.map(day => `
            <div class="border-b border-white/5 pb-4">
                <h4 class="uppercase text-xs font-bold text-gray-500 mb-3">${day}</h4>
                <div class="flex flex-wrap gap-2">
                    ${times.map(time => {
                        const isSelected = this.state.localAvailability[day] && this.state.localAvailability[day].includes(time);
                        return `<button onclick="app.toggleLocalSlot('${day}', '${time}')" class="px-3 py-1 rounded-md text-xs border ${isSelected ? 'bg-white text-black' : 'border-white/10 text-gray-400'}">${time}</button>`;
                    }).join('')}
                </div>
            </div>`).join('');
    },

    toggleLocalSlot(day, time) {
        if (!this.state.localAvailability[day]) this.state.localAvailability[day] = [];
        const index = this.state.localAvailability[day].indexOf(time);
        if (index > -1) this.state.localAvailability[day].splice(index, 1);
        else this.state.localAvailability[day].push(time);
        this.renderAvailabilityEditor();
    },

    async saveAvailability() {
        try {
            await api.updateAvailability(this.state.currentUser.id, this.state.localAvailability);
            alert("Availability Saved!");
            this.state.currentUser.weekly_availability = this.state.localAvailability;
            storage.set('lynx_user', this.state.currentUser);
        } catch (e) { alert("Save failed"); }
    },

    async loadLessonRates() {
        const ratesStatus = document.getElementById('ratesStatus');
        const btn = document.getElementById('btnSaveRates');
        const inputWithout = document.getElementById('rateWithoutCar');
        const inputWith = document.getElementById('rateWithCar');
        const inputTransport = document.getElementById('testTransportRate');
        const btnOnboard = document.getElementById('btnCompleteOnboarding');
        const mentorStatusBadge = document.getElementById('mentorStatusBadge');
        if (!ratesStatus || !btn) return;

        ratesStatus.innerText = "Checking onboarding status...";
        btn.disabled = true;
        inputWithout.disabled = true;
        inputWith.disabled = true;
        inputTransport.disabled = true;
        if (btnOnboard) btnOnboard.classList.add('hidden');

        try {
            // Refresh user status from backend so approvals are reflected immediately
            const freshUser = await api.getUser(this.state.currentUser.id);
            this.state.currentUser = { ...this.state.currentUser, ...freshUser };
            storage.set('lynx_user', this.state.currentUser);
            const serviceStatus = await api.getServiceStatus(this.state.currentUser.id);
            this.state.serviceStatus = serviceStatus;
            this.renderServiceStatus(serviceStatus.services);

            if (mentorStatusBadge) {
                const status = this.state.currentUser?.mentor_status || "pending_review";
                mentorStatusBadge.classList.remove('hidden');
                if (status === "approved") {
                    mentorStatusBadge.className = "text-[10px] font-bold uppercase tracking-widest mb-3 text-green-400";
                    mentorStatusBadge.innerText = "Mentor Status: Approved";
                } else if (status === "rejected") {
                    mentorStatusBadge.className = "text-[10px] font-bold uppercase tracking-widest mb-3 text-red-400";
                    mentorStatusBadge.innerText = "Mentor Status: Rejected";
                } else {
                    mentorStatusBadge.className = "text-[10px] font-bold uppercase tracking-widest mb-3 text-yellow-400";
                    mentorStatusBadge.innerText = "Mentor Status: Pending Review";
                }
            }
            const status = await api.getStripeStatus(this.state.currentUser.id);
            if (status.error) {
                ratesStatus.innerText = "Unable to verify Stripe status. Try Refresh Status.";
                this.showToast(status.error, "error");
                return;
            }

            const mentorApproved = this.state.currentUser?.mentor_status === "approved";
            const servicesActive = !!serviceStatus.can_start_payment_onboarding;
            const ready = mentorApproved && status.ready_to_process_payments;
            if (!servicesActive) {
                ratesStatus.innerText = "Activate at least one service to enable payout onboarding.";
            } else if (ready) {
                ratesStatus.innerText = "Payouts active. You can update rates.";
            } else {
                ratesStatus.innerText = "Service active. Complete Stripe onboarding to accept payments.";
            }
            btn.disabled = !ready;
            inputWithout.disabled = !ready;
            inputWith.disabled = !ready;
            inputTransport.disabled = !ready;
            if (!ready && btnOnboard && mentorApproved && servicesActive) btnOnboard.classList.remove('hidden');
            this.updatePayoutBadge(ready);
        } catch (e) {
            ratesStatus.innerText = "Unable to check status.";
        }

        if (this.state.currentUser) {
            inputWithout.value = this.state.currentUser.hourly_rate_without_car || 0;
            inputWith.value = this.state.currentUser.hourly_rate_with_car || 0;
            if (inputTransport) inputTransport.value = this.state.currentUser.test_transport_rate || 0;
        }
    },

    renderServiceStatus(services = {}) {
        const map = {
            A: services.service_a_training_without_car,
            B: services.service_b_training_with_car,
            C: services.service_c_test_transport
        };
        Object.entries(map).forEach(([code, s]) => {
            const el = document.getElementById(`serviceStatus${code}`);
            if (!el || !s) return;
            const active = !!s.active;
            el.innerText = active ? "ACTIVE" : "INACTIVE";
            el.className = active ? "text-green-400 font-bold" : "text-yellow-400 font-bold";
        });
    },

    async openServiceActivation(code) {
        this.state.selectedServiceCode = code;
        const modal = document.getElementById('serviceModal');
        const title = document.getElementById('serviceModalTitle');
        const checklist = document.getElementById('serviceChecklist');
        const termInfo = document.getElementById('serviceModalTermInfo');
        if (!modal || !title || !checklist || !termInfo) return;

        const defs = {
            A: {
                name: "A. Driving Training without Car",
                ackType: "driver_training_without_car_terms",
                items: [
                    { id: "svcCertified", text: "I am a certified driving instructor and affliated with a driving school." },
                    { id: "svcTerms", text: `I understand and accept the legal terms in <a href="terms.html" target="_blank" class="underline">Terms & Safety</a>.` }
                ]
            },
            B: {
                name: "B. Driving Training with Car",
                ackType: "driver_training_with_car_terms",
                items: [
                    { id: "svcCertified", text: "I am a certified driving instructor and affliated with a driving school." },
                    { id: "svcTerms", text: `I understand and accept the legal terms in <a href="terms.html" target="_blank" class="underline">Terms & Safety</a>.` },
                    { id: "svcInsurance", text: "I confirm I have valid commercial/for-hire or equivalent insurance for paid passenger transport." }
                ]
            },
            C: {
                name: "C. Test Transport",
                ackType: "driver_test_transport_terms",
                items: [
                    { id: "svcTerms", text: `I understand and accept the legal terms in <a href="terms.html" target="_blank" class="underline">Terms & Safety</a>.` },
                    { id: "svcInsurance", text: "I confirm I have valid commercial/for-hire or equivalent insurance for paid passenger transport." },
                    { id: "svcLicense", text: `I confirm I meet local for-hire/TNC licensing requirements (<a href="https://www.nyc.gov/site/tlc/drivers/get-a-tlc-drivers-license.page" target="_blank" class="underline">what it means</a>).` }
                ]
            }
        };
        const def = defs[code];
        if (!def) return;
        title.innerText = `Activate ${def.name}`;
        checklist.innerHTML = def.items.map(i => `
            <label class="flex items-start gap-2 text-xs text-gray-300">
                <input type="checkbox" id="${i.id}" class="w-4 h-4 mt-0.5">
                <span>${i.text}</span>
            </label>
        `).join('');
        termInfo.innerText = "Loading active legal term...";
        try {
            const term = await api.getActiveLegalTerm(def.ackType);
            termInfo.innerText = `Active legal term id: ${term.term_id}`;
        } catch (e) {
            termInfo.innerText = "Active legal term unavailable.";
        }
        modal.classList.replace('hidden', 'flex');
    },

    closeServiceActivation() {
        document.getElementById('serviceModal')?.classList.replace('flex', 'hidden');
        this.state.selectedServiceCode = null;
    },

    async activateSelectedService() {
        const code = this.state.selectedServiceCode;
        if (!code || !this.state.currentUser) return;
        const certified = !!document.getElementById('svcCertified')?.checked;
        const terms = !!document.getElementById('svcTerms')?.checked;
        const insurance = !!document.getElementById('svcInsurance')?.checked;
        const license = !!document.getElementById('svcLicense')?.checked;
        try {
            await api.activateService({
                user_id: this.state.currentUser.id,
                service_code: code,
                certified_instructor_affiliated: certified,
                accepts_terms: terms,
                confirms_commercial_insurance: insurance,
                confirms_for_hire_or_tnc_license: license
            });
            this.showToast(`Service ${code} activated.`, "success");
            this.closeServiceActivation();
            await this.loadLessonRates();
        } catch (e) {
            this.showToast(e.message || "Activation failed.", "error");
        }
    },

    async refreshPayoutStatus() {
        const ratesStatus = document.getElementById('ratesStatus');
        if (!this.state.currentUser) return;
        ratesStatus.innerText = "Refreshing status...";
        try {
            const status = await api.getStripeStatus(this.state.currentUser.id);
            const ready = status.details_submitted && status.ready_to_process_payments;
            ratesStatus.innerText = ready ? "Payouts active. You can update rates." : "Complete Stripe onboarding to set rates.";
            this.updatePayoutBadge(ready);
            this.showToast("Payout status refreshed.", "success");
            if (ready) {
                this.state.currentUser.stripe_onboarding_complete = true;
                storage.set('lynx_user', this.state.currentUser);
                this.switchTab('rates');
                this.loadLessonRates();
                const rateWithout = this.state.currentUser.hourly_rate_without_car || 0;
                const rateWith = this.state.currentUser.hourly_rate_with_car || 0;
                if (rateWithout > 0 || rateWith > 0) {
                    await api.updateLessonRates({
                        user_id: this.state.currentUser.id,
                        rate_without_car: rateWithout,
                        rate_with_car: rateWith,
                        currency: "usd"
                    });
                    this.showToast("Lesson products synced.", "success");
                }
            }
        } catch (e) {
            ratesStatus.innerText = "Unable to check status.";
            this.showToast("Failed to refresh status.", "error");
        }
    },

    async saveLessonRates() {
        const inputWithout = document.getElementById('rateWithoutCar');
        const inputWith = document.getElementById('rateWithCar');
        const inputTransport = document.getElementById('testTransportRate');
        this.showToast("Saving rates...", "info");
        try {
            const res = await api.updateLessonRates({
                user_id: this.state.currentUser.id,
                rate_without_car: parseFloat(inputWithout.value || 0),
                rate_with_car: parseFloat(inputWith.value || 0),
                currency: "usd"
            });
            await api.updateUser(this.state.currentUser.id, {
                test_transport_rate: parseFloat(inputTransport.value || 0)
            });
            this.showToast(res.message || "Rates updated.", "success");
            this.state.currentUser.hourly_rate_without_car = parseFloat(inputWithout.value || 0);
            this.state.currentUser.hourly_rate_with_car = parseFloat(inputWith.value || 0);
            this.state.currentUser.test_transport_rate = parseFloat(inputTransport.value || 0);
            storage.set('lynx_user', this.state.currentUser);
            if (!document.getElementById('viewFind').classList.contains('hidden')) {
                this.loadMentors();
            }
        } catch (e) {
            this.showToast("Update failed.", "error");
        }
    },

    async loadPolicy() {
        const list = document.getElementById('policyList');
        if (!list) return;
        list.innerHTML = "<li class='text-gray-500'>Loading...</li>";
        try {
            const res = await api.getRefundPolicy();
            list.innerHTML = res.body.map(item => `<li>• ${item}</li>`).join('');
        } catch (e) {
            list.innerHTML = "<li class='text-gray-500'>Unable to load policy.</li>";
        }
    },

    startStripeOnboardingFromDashboard() {
        if (!this.state.currentUser) return;
        if (!this.state.serviceStatus?.can_start_payment_onboarding) {
            this.showToast("Activate at least one service first.", "error");
            return;
        }
        this.showToast("Opening Stripe onboarding...", "info");
        api.createOnboardingLink(this.state.currentUser.id)
            .then((data) => {
                window.location.href = data.url;
            })
            .catch(() => this.showToast("Could not create onboarding link.", "error"));
    },

    showToast(message, variant = "info") {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const el = document.createElement('div');
        const colors = {
            success: "border-green-500/40 text-green-300",
            error: "border-red-500/40 text-red-300",
            info: "border-white/20 text-gray-200"
        };
        el.className = `glass-panel px-4 py-3 text-xs font-bold ${colors[variant] || colors.info}`;
        el.innerText = message;
        container.appendChild(el);
        setTimeout(() => {
            el.style.opacity = "0";
            el.style.transform = "translateY(6px)";
        }, 2800);
        setTimeout(() => el.remove(), 3200);
    },

    toggleUserMenu() {
        const menu = document.getElementById('userMenu');
        if (!menu) return;
        menu.classList.toggle('hidden');
        this.updateVerificationMenu();
    },

    updateVerificationMenu() {
        if (!this.state.currentUser) return;
        const emailLine = document.getElementById('verifEmail');
        const mentorLine = document.getElementById('verifMentor');
        const payoutsLine = document.getElementById('verifPayouts');
        const emailBadge = document.getElementById('emailVerifiedBadge');
        const shareBtn = document.getElementById('shareProfileBtn');
        if (!emailLine || !mentorLine || !payoutsLine) return;
        emailLine.innerText = `Email: ${this.state.currentUser.email_verified ? "Verified" : "Pending"}`;
        mentorLine.innerText = `Mentor Approval: ${this.state.currentUser.mentor_status || "Pending"}`;
        payoutsLine.innerText = `Payouts: ${this.state.currentUser.stripe_onboarding_complete ? "Ready" : "Pending"}`;
        if (emailBadge) emailBadge.classList.toggle('hidden', !this.state.currentUser.email_verified);
        if (shareBtn) {
            shareBtn.classList.toggle('hidden', this.state.currentUser.role !== 'mentor' || !this.state.currentUser.email_verified);
        }
    },

    showOtpModal(email) {
        this.state.pendingOtpEmail = email;
        document.getElementById('otpModal').classList.replace('hidden', 'flex');
    },

    closeOtpModal() {
        document.getElementById('otpModal').classList.replace('flex', 'hidden');
    },

    async verifyOtp() {
        const code = document.getElementById('otpCode').value.trim();
        if (!code) return;
        try {
            await api.verifyEmailOtp(this.state.pendingOtpEmail, code);
            this.showToast("Email verified. Please log in.", "success");
            storage.remove('lynx_user');
            this.ensureLoggedOutUI();
            this.closeOtpModal();
            this.openModal('login');
        } catch (e) {
            this.showToast("Invalid or expired code.", "error");
        }
    },

    async resendOtp() {
        try {
            await api.sendEmailOtp(this.state.pendingOtpEmail);
            this.showToast("OTP resent.", "success");
        } catch (e) {
            this.showToast("Failed to resend OTP.", "error");
        }
    },

    updatePayoutBadge(isReady) {
        const badge = document.getElementById('payoutBadge');
        if (!badge) return;
        badge.classList.toggle('hidden', !isReady);
    },

    async handleRequest(sid, action) {
        try {
            await api.handleRequestAction(sid, this.state.currentUser.id, action);
            this.loadRequests();
        } catch (e) { alert("Action failed"); }
    },

    openModal(mode, role = 'learner') {
        document.getElementById('authModal').classList.replace('hidden', 'flex');
        const loginSec = document.getElementById('loginSection');
        const progress = document.getElementById('wizardProgress');
        const controls = document.getElementById('wizardControls');
        if (mode === 'login') {
            loginSec.classList.remove('hidden-section');
            progress.classList.add('hidden');
            controls.classList.add('hidden');
            document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden-section'));
        } else {
            this.state.userRole = role;
            loginSec.classList.add('hidden-section');
            progress.classList.remove('hidden');
            controls.classList.remove('hidden');
            const mentorFields = document.getElementById('mentorFields');
            if (mentorFields) mentorFields.style.display = role === 'mentor' ? 'block' : 'none';
            this.state.currentStep = 1;
            this.showStep(1);
        }
    },

    showStep(step) {
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden-section'));
        document.getElementById(`step${step}`).classList.remove('hidden-section');
        document.getElementById('stepCount').innerText = `${step}/${this.state.totalSteps}`;
        document.getElementById('progressBar').style.width = `${(step / this.state.totalSteps) * 100}%`;
        const nextBtn = document.getElementById('nextBtn');
        document.getElementById('backBtn').style.visibility = step === 1 ? 'hidden' : 'visible';
        nextBtn.innerText = step === this.state.totalSteps ? "FINISH REGISTRATION" : "CONTINUE";
    },

    changeStep(dir) {
        if (dir === 1) {
            if (this.state.currentStep < this.state.totalSteps) {
                this.state.currentStep++;
                this.showStep(this.state.currentStep);
            } else { this.handleRegistration(); }
        } else {
            this.state.currentStep--;
            this.showStep(this.state.currentStep);
        }
    },

    setHasCar(val) {
        this.state.hasCar = val;
        const yes = document.getElementById('carBtnYes');
        const no = document.getElementById('carBtnNo');
        const details = document.getElementById('carDetailsForm');
        yes.className = val ? "flex-1 p-4 rounded-xl bg-white text-black font-bold transition-all" : "flex-1 p-4 rounded-xl bg-white/5 border border-white/10 font-bold transition-all";
        no.className = !val ? "flex-1 p-4 rounded-xl bg-white text-black font-bold transition-all" : "flex-1 p-4 rounded-xl bg-white/5 border border-white/10 font-bold transition-all";
        val ? details.classList.remove('hidden') : details.classList.add('hidden');
    },

    readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("File read failed"));
            reader.readAsDataURL(file);
        });
    },

    handleDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const mentorId = params.get('mentor_id');
        const needsLogin = params.get('login') === '1';
        if (mentorId) {
            this.state.pendingMentorId = mentorId;
            if (needsLogin) this.openModal('login');
        }
    },

    setStar(n) {
        this.state.currentRating = n;
        document.querySelectorAll('.star-rating').forEach((s, i) => s.classList.toggle('active', i < n));
    },

    async handleOnboardingReturn() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('onboarding') !== 'success') return;

        this.showBanner("Payouts setup complete. Checking status...");

        if (this.state.currentUser?.role === 'mentor') {
            try {
                const status = await api.checkStripeStatus(this.state.currentUser.id);
                if (status.details_submitted) {
                    this.state.currentUser.stripe_onboarding_complete = true;
                    storage.set('lynx_user', this.state.currentUser);
                    this.showBanner("Payouts setup complete. You can now receive paid requests.");
                    this.showToast("Payouts setup complete.", "success");
                    this.updatePayoutBadge(true);
                    this.switchTab('rates');
                    this.loadLessonRates();
                } else {
                    this.showBanner("Payouts setup started. Please finish in Stripe if prompted again.");
                }
            } catch (e) {
                this.showBanner("Payouts setup complete. Refresh if status doesn't update.");
            }
        }

        params.delete('onboarding');
        const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, document.title, newUrl);
    },

    showBanner(message) {
        const banner = document.getElementById('banner');
        const text = document.getElementById('bannerText');
        if (!banner || !text) return;
        text.innerText = message;
        banner.classList.remove('hidden');
        clearTimeout(this._bannerTimer);
        this._bannerTimer = setTimeout(() => banner.classList.add('hidden'), 7000);
    },

    closeModal() { document.getElementById('authModal').classList.replace('flex', 'hidden'); },
    closeDateModal() { document.getElementById('dateModal').classList.replace('flex', 'hidden'); },
    openLicenseModal() {
        const img = document.getElementById('licenseImage');
        if (!this.state.selectedMentor?.license_image) return;
        img.src = this.state.selectedMentor.license_image;
        document.getElementById('licenseModal').classList.replace('hidden', 'flex');
    },
    closeLicenseModal() { document.getElementById('licenseModal').classList.replace('flex', 'hidden'); },
    openShareProfile() {
        if (!this.state.currentUser || this.state.currentUser.role !== 'mentor') return;
        window.location.href = `mentor-share.html?mentor_id=${this.state.currentUser.id}`;
    },
    ensureLoggedOutUI() {
        const navUser = document.getElementById('navUserArea');
        const navAuth = document.getElementById('navAuthButtons');
        const landing = document.getElementById('landingView');
        const dashboard = document.getElementById('dashboardView');
        if (navUser) navUser.classList.add('hidden');
        if (navAuth) navAuth.classList.remove('hidden');
        if (landing) landing.classList.remove('hidden');
        if (dashboard) dashboard.classList.add('hidden');
    },
    logout() { storage.remove('lynx_user'); window.location.reload(); },
    goHome() { window.location.reload(); }
};

window.onload = () => app.init();
const storage = { get: (k) => JSON.parse(localStorage.getItem(k)), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)), remove: (k) => localStorage.removeItem(k) };

// const app = {
//     state: {
//         currentUser: null,
//         selectedMentor: null,
//         selectedSlots: [],
//         activeSession: null,
//         sessionPoller: null,
//         tempSelectedDates: [],
//         currentRating: 0,
//         localAvailability: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
//         userRole: 'learner',
//         hasCar: false,
//         currentStep: 1,
//         totalSteps: 4,
//         scanner: null,
//         stripe: null,
//         cardElement: null
//     },

//     init() {
//         setTimeout(() => document.getElementById('splash').style.transform = 'translateY(-100%)', 1000);
//         const user = storage.get('lynx_user');
//         if (user) this.showDashboard(user);
//         this.initStripe();
//     },

//     // --- STRIPE INIT ---
//     initStripe() {
//         // Use your Stripe Test Public Key here
//         if (window.Stripe) {
//             this.state.stripe = Stripe('pk_test_TYooMQauvdEDq54NiTphI7jx'); // Replace if you have your own
//             const elements = this.state.stripe.elements();
//             this.state.cardElement = elements.create('card', {
//                 style: {
//                     base: {
//                         color: "#ffffff",
//                         fontFamily: '"Inter", sans-serif',
//                         fontSmoothing: "antialiased",
//                         fontSize: "16px",
//                         "::placeholder": { color: "#aab7c4" }
//                     },
//                     invalid: { color: "#fa755a", iconColor: "#fa755a" }
//                 }
//             });
//             // We mount this when the payment view opens, so we check existence
//             // Actually, Stripe Elements needs the DOM to exist. 
//             // We'll mount it inside proceedToPayment to ensure the div is visible.
//         }
//     },

//     // --- Auth & Registration ---
//     async loginAction() {
//         const email = document.getElementById('loginEmail').value;
//         const pass = document.getElementById('loginPass').value;
//         try {
//             const data = await api.login(email, pass);
//             storage.set('lynx_user', data.user);
//             this.showDashboard(data.user);
//             this.closeModal();
//         } catch (e) { alert("Login failed"); }
//     },

//     async handleRegistration() {
//         const btn = document.getElementById('nextBtn');
//         if (!document.getElementById('regConsent').checked) return alert("Agree to terms required");
//         btn.innerText = "Processing...";
//         const payload = {
//             role: this.state.userRole,
//             first_name: document.getElementById('regFirst').value,
//             last_name: document.getElementById('regLast').value,
//             email: document.getElementById('regEmail').value,
//             password: document.getElementById('regPass').value,
//             license_number: document.getElementById('regLicense').value,
//             address: document.getElementById('regAddress').value,
//             city: document.getElementById('regCity').value,
//             state: "NY",
//             zip_code: document.getElementById('regZip').value,
//             hourly_rate: parseFloat(document.getElementById('regRate').value || 0),
//             has_car: this.state.hasCar,
//             car_make_model: document.getElementById('regCarModel').value || null,
//             car_plate: document.getElementById('regCarPlate').value || null
//         };
//         try {
//             await api.register(payload);
//             alert("Account created! Please login.");
//             this.openModal('login');
//         } catch (e) { alert(e.message); }
//         btn.innerText = "FINISH REGISTRATION";
//     },

//     showDashboard(user) {
//         this.state.currentUser = user;
//         document.getElementById('landingView').classList.add('hidden');
//         document.getElementById('dashboardView').classList.remove('hidden');
//         document.getElementById('navAuthButtons').classList.add('hidden');
//         document.getElementById('navUserArea').classList.remove('hidden');
//         document.getElementById('userNameDisplay').innerText = user.first_name;
//         document.getElementById('roleBadge').innerText = user.role;

//         if (user.role === 'mentor') {
//             document.getElementById('tabFind').classList.add('hidden');
//             document.getElementById('tabRequests').classList.remove('hidden');
//             document.getElementById('tabAvail').classList.remove('hidden');
//             document.getElementById('tabUpcoming').classList.remove('hidden');
//             this.switchTab('requests');
//         } else {
//             document.getElementById('tabFind').classList.remove('hidden');
//             document.getElementById('tabRequests').classList.add('hidden');
//             document.getElementById('tabAvail').classList.add('hidden');
//             document.getElementById('tabUpcoming').classList.remove('hidden');
//             this.switchTab('find');
//             this.loadMentors();
//         }
//     },

//     switchTab(tabId) {
//         if (this.state.scanner) {
//             this.state.scanner.clear();
//             this.state.scanner = null;
//         }
//         if (tabId !== 'session' && this.state.sessionPoller) {
//             clearInterval(this.state.sessionPoller);
//             this.state.sessionPoller = null;
//         }
        
//         ui.switchTab(tabId, this.state.currentUser?.role);

//         if (tabId === 'requests') this.loadRequests();
//         if (tabId === 'upcoming') this.loadUpcoming();
//         if (tabId === 'avail') this.showAvailabilityEditor();
//     },

//     // --- Search & Booking ---
//     async loadMentors() {
//         const zip = document.getElementById('filterZip').value;
//         const rate = document.getElementById('filterRate').value;
//         try {
//             const data = await api.getMentors(zip, rate);
//             ui.renderMentors(data);
//         } catch (e) { }
//     },

//     async openMentorProfile(id) {
//         try {
//             const data = await api.getMentorDetails(id);
//             this.state.selectedMentor = data;
//             document.getElementById('viewFind').classList.add('hidden');
//             document.getElementById('viewProfile').classList.remove('hidden');
//             this.state.selectedSlots = [];
//             document.getElementById('selectedCount').innerText = "0";
//             ui.renderProfile(data, data.availability, []);
//         } catch (e) { alert(e.message); }
//     },

//     // --- Session Logic ---
//     async loadUpcoming() {
//         try {
//             const data = await api.getUpcoming(this.state.currentUser.id, this.state.currentUser.role);
//             ui.renderUpcoming(data);
//         } catch (e) { document.getElementById('upcomingGrid').innerHTML = "Error loading schedule."; }
//     },

//     async enterSessionMode(sessionId) {
//         if (!sessionId) return;
//         document.getElementById('tabSession').classList.remove('hidden');
        
//         try {
//             const fresh = await api.getSessionStatus(sessionId);
//             this.state.activeSession = fresh;
//         } catch (e) {
//             this.state.activeSession = { id: sessionId, status: 'scheduled' }; 
//         }
        
//         ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
        
//         if (this.state.sessionPoller) clearInterval(this.state.sessionPoller);
//         this.state.sessionPoller = setInterval(() => this.syncSessionStatus(), 5000);
        
//         this.switchTab('session');
//     },

//     async syncSessionStatus() {
//         if (!this.state.activeSession) return;
//         try {
//             const fresh = await api.getSessionStatus(this.state.activeSession.id);
//             if (fresh.status !== this.state.activeSession.status) {
//                 this.state.activeSession = fresh;
//                 ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
//             }
//         } catch (e) { console.log(e); }
//     },

//     async generateQR() {
//         try {
//             const data = await api.getQRToken(this.state.activeSession.id, this.state.currentUser.id);
//             const canvas = document.getElementById('qrCanvas');
//             canvas.innerHTML = "";
//             new QRCode(canvas, { text: data.qr_string, width: 180, height: 180 });
//             document.getElementById('qrContainer').classList.remove('hidden');
//             document.getElementById('btnGenerateQR').classList.add('hidden');
//         } catch (e) { alert("Error: " + e.message); }
//     },

//     // --- CAMERA LOGIC ---
//     startScanner() {
//         document.getElementById('scanContainer').classList.remove('hidden');
//         document.getElementById('btnOpenScanner').classList.add('hidden');

//         if(!document.getElementById('reader')) return alert("Scanner DOM error. Try refreshing.");

//         try {
//             // Re-init scanner if needed
//             if (!this.state.scanner) {
//                 this.state.scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
//             }
//             this.state.scanner.render(
//                 (decodedText) => this.handleScanSuccess(decodedText),
//                 (error) => { /* ignore */ }
//             );
//         } catch (e) {
//             alert("Camera failed. Check permissions.");
//         }
//     },

//     async handleScanSuccess(qrString) {
//         if (this.state.scanner) {
//             this.state.scanner.clear();
//             this.state.scanner = null;
//         }

//         try {
//             const data = await api.scanQR(this.state.currentUser.id, qrString);
//             alert(data.message);
//             if (data.message.includes("Started") || data.message.includes("Active")) {
//                 this.state.activeSession.status = 'active';
//             }
//             if (data.message.includes("Ended")) {
//                 this.state.activeSession.status = 'completed';
//             }
//             ui.renderSessionStatus(this.state.activeSession, this.state.currentUser.role);
//         } catch (e) { alert("Scan Failed: " + e.message); }
//     },

//     async processManualScan() {
//         const token = document.getElementById('scanInput').value;
//         this.handleScanSuccess(token);
//     },

//     async saveEvaluation() {
//         const data = {
//             steering: document.getElementById('evalSteering').checked,
//             mirrors: document.getElementById('evalMirrors').checked,
//             braking: document.getElementById('evalBraking').checked,
//             signals: document.getElementById('evalSignals').checked
//         };
//         try {
//             await api.saveEvaluation(this.state.activeSession.id, this.state.currentUser.id, data);
//             alert("Evaluation Saved!");
//         } catch (e) { alert("Save failed"); }
//     },

//     async submitRating() {
//         if (this.state.currentRating === 0) return alert("Select stars");
//         const comment = document.getElementById('ratingComment').value;
//         try {
//             await api.submitRating(this.state.activeSession.id, this.state.currentUser.id, this.state.currentRating, comment);
//             alert("Rating Submitted!");
//             this.exitSession();
//         } catch (e) { alert("Submit failed"); }
//     },

//     exitSession() {
//         if (this.state.scanner) { 
//             this.state.scanner.clear(); 
//             this.state.scanner = null; 
//         }
//         clearInterval(this.state.sessionPoller);
//         this.state.activeSession = null;
//         document.getElementById('tabSession').classList.add('hidden');
//         this.switchTab('upcoming');
//     },

//     // --- Booking Flow & Stripe ---
//     openDateModal(day, time) {
//         this.state.tempSelectedDates = [...this.state.selectedSlots];
//         const dates = ui.getNextFourDates(day, time);
//         const container = document.getElementById('dateOptionsGrid');
//         document.getElementById('dateModalTitle').innerText = `${day.toUpperCase()} @ ${time}`;

//         container.innerHTML = dates.map(dateObj => {
//             const iso = dateObj.toISOString().slice(0, 19);
//             const isSelected = this.state.selectedSlots.some(s => s.startsWith(iso));
//             return `
//             <div onclick="app.toggleDateSelection('${iso}', this)" 
//                  class="cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center ${isSelected ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}">
//                 <span class="font-bold">${ui.formatDateNice(dateObj)}</span>
//                 <div class="w-4 h-4 rounded-full border ${isSelected ? 'bg-black border-black' : 'border-gray-500'}"></div>
//             </div>`;
//         }).join('');
//         document.getElementById('dateModal').classList.replace('hidden', 'flex');
//     },

//     toggleDateSelection(iso, el) {
//         const idx = this.state.tempSelectedDates.findIndex(s => s.startsWith(iso));
//         if (idx > -1) {
//             this.state.tempSelectedDates.splice(idx, 1);
//             el.className = 'cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center bg-white/5 border-white/10 text-gray-300 hover:bg-white/10';
//             el.querySelector('div').className = 'w-4 h-4 rounded-full border border-gray-500';
//         } else {
//             this.state.tempSelectedDates.push(iso);
//             el.className = 'cursor-pointer p-4 rounded-xl border transition-all flex justify-between items-center bg-white text-black border-white';
//             el.querySelector('div').className = 'w-4 h-4 rounded-full border bg-black border-black';
//         }
//     },

//     confirmDateSelection() {
//         this.state.selectedSlots = [...this.state.tempSelectedDates];
//         document.getElementById('selectedCount').innerText = this.state.selectedSlots.length;
//         this.closeDateModal();
//         if (this.state.selectedMentor) ui.renderCalendar(this.state.selectedMentor.availability, this.state.selectedSlots);
//     },

//     proceedToPayment() {
//         if(this.state.selectedSlots.length === 0) return alert("Select at least one slot.");
//         document.getElementById('viewProfile').classList.add('hidden');
//         document.getElementById('viewPayment').classList.remove('hidden');
        
//         const count = this.state.selectedSlots.length;
//         const rate = this.state.selectedMentor.hourly_rate;
//         const subtotal = count * rate;
        
//         document.getElementById('payCount').innerText = count;
//         document.getElementById('payRate').innerText = `$${rate}`;
//         document.getElementById('paySubtotal').innerText = `$${subtotal.toFixed(2)}`;
//         document.getElementById('payTotal').innerText = `$${(subtotal+5).toFixed(2)}`;

//         // Mount Stripe Element now that the div is visible
//         if (this.state.cardElement) {
//             this.state.cardElement.mount('#card-element');
//         }
//     },

//     async submitBooking() {
//         const btn = document.getElementById('btnSubmitPayment');
//         btn.innerText = "Processing...";
//         btn.disabled = true;

//         try {
//             // 1. Create Payment Method via Stripe.js
//             const {paymentMethod, error} = await this.state.stripe.createPaymentMethod({
//                 type: 'card',
//                 card: this.state.cardElement,
//             });

//             if (error) {
//                 document.getElementById('card-errors').textContent = error.message;
//                 throw new Error(error.message);
//             }

//             // 2. Send to Backend
//             const res = await api.createBookingIntent({
//                 mentor_id: this.state.selectedMentor.id,
//                 mentee_id: this.state.currentUser.id,
//                 datetime_slots: this.state.selectedSlots,
//                 payment_method_id: paymentMethod.id
//             });

//             // 3. Handle 3DS Action if needed (Manual Capture usually doesn't need immediate action unless triggered)
//             // But we check just in case.
//             if (res.error) {
//                 // If backend returns a Stripe error
//                 throw new Error(res.error);
//             }

//             alert("Payment Authorized! Booking Confirmed.");
//             this.switchTab('find');

//         } catch (e) {
//             alert("Booking Error: " + e.message);
//         } finally {
//             btn.innerText = "AUTHORIZE PAYMENT & BOOK";
//             btn.disabled = false;
//         }
//     },

//     // --- Availability & Requests ---
//     showAvailabilityEditor() {
//         if (this.state.currentUser.weekly_availability) {
//             this.state.localAvailability = typeof this.state.currentUser.weekly_availability === 'string'
//                 ? JSON.parse(this.state.currentUser.weekly_availability)
//                 : this.state.currentUser.weekly_availability;
//         }
//         this.renderAvailabilityEditor();
//     },

//     renderAvailabilityEditor() {
//         const container = document.getElementById('availabilityEditor');
//         const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
//         const times = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

//         container.innerHTML = days.map(day => `
//             <div class="border-b border-white/5 pb-4">
//                 <h4 class="uppercase text-xs font-bold text-gray-500 mb-3">${day}</h4>
//                 <div class="flex flex-wrap gap-2">
//                     ${times.map(time => {
//                         const isSelected = this.state.localAvailability[day] && this.state.localAvailability[day].includes(time);
//                         return `<button onclick="app.toggleLocalSlot('${day}', '${time}')" class="px-3 py-1 rounded-md text-xs border ${isSelected ? 'bg-white text-black' : 'border-white/10 text-gray-400'}">${time}</button>`;
//                     }).join('')}
//                 </div>
//             </div>`).join('');
//     },

//     toggleLocalSlot(day, time) {
//         if (!this.state.localAvailability[day]) this.state.localAvailability[day] = [];
//         const index = this.state.localAvailability[day].indexOf(time);
//         if (index > -1) this.state.localAvailability[day].splice(index, 1);
//         else this.state.localAvailability[day].push(time);
//         this.renderAvailabilityEditor();
//     },

//     async saveAvailability() {
//         try {
//             await api.updateAvailability(this.state.currentUser.id, this.state.localAvailability);
//             alert("Availability Saved!");
//             this.state.currentUser.weekly_availability = this.state.localAvailability;
//             storage.set('lynx_user', this.state.currentUser);
//         } catch (e) { alert("Save failed"); }
//     },

//     async loadRequests() {
//         try {
//             const data = await api.getRequests(this.state.currentUser.id);
//             ui.renderRequests(data);
//         } catch (e) { }
//     },

//     async handleRequest(sid, action) {
//         try {
//             await api.handleRequestAction(sid, this.state.currentUser.id, action);
//             this.loadRequests();
//         } catch (e) { alert("Action failed"); }
//     },

//     // --- Auth Helpers ---
//     openModal(mode, role = 'learner') {
//         document.getElementById('authModal').classList.replace('hidden', 'flex');
//         const loginSec = document.getElementById('loginSection');
//         const progress = document.getElementById('wizardProgress');
//         const controls = document.getElementById('wizardControls');
//         if (mode === 'login') {
//             loginSec.classList.remove('hidden-section');
//             progress.classList.add('hidden');
//             controls.classList.add('hidden');
//             document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden-section'));
//         } else {
//             this.state.userRole = role;
//             loginSec.classList.add('hidden-section');
//             progress.classList.remove('hidden');
//             controls.classList.remove('hidden');
//             const mentorFields = document.getElementById('mentorFields');
//             if (mentorFields) mentorFields.style.display = role === 'mentor' ? 'block' : 'none';
//             this.state.currentStep = 1;
//             this.showStep(1);
//         }
//     },

//     showStep(step) {
//         document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden-section'));
//         document.getElementById(`step${step}`).classList.remove('hidden-section');
//         document.getElementById('stepCount').innerText = `${step}/${this.state.totalSteps}`;
//         document.getElementById('progressBar').style.width = `${(step / this.state.totalSteps) * 100}%`;
//         const nextBtn = document.getElementById('nextBtn');
//         document.getElementById('backBtn').style.visibility = step === 1 ? 'hidden' : 'visible';
//         nextBtn.innerText = step === this.state.totalSteps ? "FINISH REGISTRATION" : "CONTINUE";
//     },

//     changeStep(dir) {
//         if (dir === 1) {
//             if (this.state.currentStep < this.state.totalSteps) {
//                 this.state.currentStep++;
//                 this.showStep(this.state.currentStep);
//             } else { this.handleRegistration(); }
//         } else {
//             this.state.currentStep--;
//             this.showStep(this.state.currentStep);
//         }
//     },

//     setHasCar(val) {
//         this.state.hasCar = val;
//         const yes = document.getElementById('carBtnYes');
//         const no = document.getElementById('carBtnNo');
//         const details = document.getElementById('carDetailsForm');
//         yes.className = val ? "flex-1 p-4 rounded-xl bg-white text-black font-bold transition-all" : "flex-1 p-4 rounded-xl bg-white/5 border border-white/10 font-bold transition-all";
//         no.className = !val ? "flex-1 p-4 rounded-xl bg-white text-black font-bold transition-all" : "flex-1 p-4 rounded-xl bg-white/5 border border-white/10 font-bold transition-all";
//         val ? details.classList.remove('hidden') : details.classList.add('hidden');
//     },

//     setStar(n) {
//         this.state.currentRating = n;
//         document.querySelectorAll('.star-rating').forEach((s, i) => s.classList.toggle('active', i < n));
//     },

//     closeModal() { document.getElementById('authModal').classList.replace('flex', 'hidden'); },
//     closeDateModal() { document.getElementById('dateModal').classList.replace('flex', 'hidden'); },
//     logout() { storage.remove('lynx_user'); window.location.reload(); },
//     goHome() { window.location.reload(); }
// };

// window.onload = () => app.init();
// const storage = { get: (k) => JSON.parse(localStorage.getItem(k)), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)), remove: (k) => localStorage.removeItem(k) };
