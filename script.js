/* =========================================================
   PARKHASH SMART PARKING SYSTEM
   ========================================================= */


/* ================= CONSTANTS ================= */

const INITIAL_SIZE = 11;
const REHASH_SIZE = 23;

const ACCOUNT_KEY = "parkhash_account";
const CURRENT_USER_KEY = "parkhash_current_user";
const DATA_KEY = "parkhash_data";
const SETTINGS_KEY = "parkhash_settings";

const EMPTY = null;
const DELETED = Symbol("deleted");


/* ================= STATE ================= */

let currentTechnique = "linear";

let table = [];
let chainTable = [];

let activeVehicles = [];
let history = [];

let currentUser = null;

let settings = {
    theme: "aurora",
    compact: false,
    notifications: true,
    autoSave: true,
    time24: false,
    defaultTechnique: "linear"
};

let searchHighlightSlot = null;


/* ================= DOM ================= */

const $ = (id) => document.getElementById(id);


/* ================= INITIALIZATION ================= */

document.addEventListener("DOMContentLoaded", () => {

    loadSettings();

    setupAuth();

    setupNavigation();

    setupForms();

    setupControls();

    setupPasswordButtons();

    setupModal();

    setupQuickNavigation();

    const savedUser = localStorage.getItem(CURRENT_USER_KEY);

    if (savedUser) {

        try {
            currentUser = JSON.parse(savedUser);

            if (currentUser) {
                openApplication();
            }

        } catch {
            localStorage.removeItem(CURRENT_USER_KEY);
        }

    }

    setInterval(() => {

        if (currentUser) {
            renderHistory();
            renderParking();
            updateStats();
        }

    }, 1000);

});


/* =========================================================
   AUTH
   ========================================================= */

function setupAuth() {

    $("loginTab").addEventListener("click", () => {

        $("loginTab").classList.add("active");
        $("signupTab").classList.remove("active");

        $("loginForm").classList.remove("hidden");
        $("signupForm").classList.add("hidden");

    });


    $("signupTab").addEventListener("click", () => {

        $("signupTab").classList.add("active");
        $("loginTab").classList.remove("active");

        $("signupForm").classList.remove("hidden");
        $("loginForm").classList.add("hidden");

    });


    $("signupForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const name = $("signupName").value.trim();
        const email = $("signupEmail").value.trim().toLowerCase();
        const phone = $("signupPhone").value.trim();

        const password = $("signupPassword").value;
        const confirm = $("signupConfirm").value;

        const message = $("signupMessage");

        if (name.length < 2) {
            showAuthMessage(message, "Please enter your full name.");
            return;
        }

        if (password.length < 6) {
            showAuthMessage(message, "Password must contain at least 6 characters.");
            return;
        }

        if (password !== confirm) {
            showAuthMessage(message, "Passwords do not match.");
            return;
        }

        const existing = getAccount();

        if (existing && existing.email === email) {
            showAuthMessage(
                message,
                "An account already exists. Please login."
            );
            return;
        }

        const passwordHash = await hashPassword(password);

        const account = {
            name,
            email,
            phone,
            passwordHash,
            createdAt: new Date().toISOString()
        };

        localStorage.setItem(
            ACCOUNT_KEY,
            JSON.stringify(account)
        );

        currentUser = {
            name: account.name,
            email: account.email,
            phone: account.phone
        };

        localStorage.setItem(
            CURRENT_USER_KEY,
            JSON.stringify(currentUser)
        );

        initializeData();

        showToast("Account created successfully.");

        openApplication();

    });


    $("loginForm").addEventListener("submit", async (event) => {

        event.preventDefault();

        const email = $("loginEmail").value.trim().toLowerCase();
        const password = $("loginPassword").value;

        const message = $("loginMessage");

        const account = getAccount();

        if (!account) {

            showAuthMessage(
                message,
                "No account found. Please create an account first."
            );

            return;
        }

        const passwordHash = await hashPassword(password);

        if (
            account.email !== email ||
            account.passwordHash !== passwordHash
        ) {

            showAuthMessage(
                message,
                "Incorrect email or password."
            );

            return;
        }

        currentUser = {
            name: account.name,
            email: account.email,
            phone: account.phone || ""
        };

        localStorage.setItem(
            CURRENT_USER_KEY,
            JSON.stringify(currentUser)
        );

        initializeData();

        showToast("Welcome back.");

        openApplication();

    });


    $("logoutBtn").addEventListener("click", () => {

        currentUser = null;

        sessionStorage.removeItem(CURRENT_USER_KEY);
        localStorage.removeItem(CURRENT_USER_KEY);

        $("app").classList.add("hidden");
        $("authScreen").classList.remove("hidden");

        $("loginForm").reset();

        showAuthMessage(
            $("loginMessage"),
            ""
        );

    });

}


function getAccount() {

    try {
        return JSON.parse(
            localStorage.getItem(ACCOUNT_KEY)
        );

    } catch {
        return null;
    }

}


async function hashPassword(password) {

    if (
        window.crypto &&
        window.crypto.subtle &&
        window.TextEncoder
    ) {

        const data = new TextEncoder().encode(password);

        const hashBuffer =
            await crypto.subtle.digest(
                "SHA-256",
                data
            );

        return Array.from(
            new Uint8Array(hashBuffer)
        )
            .map(byte =>
                byte.toString(16).padStart(2, "0")
            )
            .join("");

    }

    return btoa(unescape(encodeURIComponent(password)));

}


function showAuthMessage(element, message) {

    element.textContent = message;

}


/* =========================================================
   APP OPEN
   ========================================================= */

function openApplication() {

    $("authScreen").classList.add("hidden");
    $("app").classList.remove("hidden");

    initializeData();

    updateProfileUI();

    applySettings();

    navigateTo("dashboard");

}


/* =========================================================
   DATA
   ========================================================= */

function initializeData() {

    const saved = loadData();

    if (saved) {

        activeVehicles = saved.activeVehicles || [];
        history = saved.history || [];

    } else {

        activeVehicles = [];
        history = [];

    }

    currentTechnique =
        settings.defaultTechnique || "linear";

    rebuildTable();

    renderAll();

}


function loadData() {

    try {

        const raw =
            localStorage.getItem(DATA_KEY);

        if (!raw) return null;

        return JSON.parse(raw);

    } catch {

        return null;

    }

}


function saveData() {

    if (!settings.autoSave) return;

    localStorage.setItem(
        DATA_KEY,
        JSON.stringify({
            activeVehicles,
            history
        })
    );

}


function loadSettings() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(SETTINGS_KEY)
            );

        if (saved) {
            settings = {
                ...settings,
                ...saved
            };
        }

    } catch {}

}


/* =========================================================
   HASH FUNCTIONS
   ========================================================= */

function hash(key, size) {

    return Math.abs(key) % size;

}


function secondHash(key) {

    return 7 - (Math.abs(key) % 7);

}


function extractKey(vehicle) {

    const digits =
        vehicle.replace(/\D/g, "");

    if (digits.length > 0) {

        return parseInt(
            digits,
            10
        );

    }

    let value = 0;

    for (let i = 0; i < vehicle.length; i++) {

        value +=
            vehicle.charCodeAt(i) * (i + 1);

    }

    return value;

}


/* =========================================================
   VEHICLE NORMALIZATION
   ========================================================= */

function normalizeVehicle(vehicle) {

    return vehicle
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

}


/* =========================================================
   TABLE REBUILD
   ========================================================= */

function rebuildTable() {

    if (currentTechnique === "rehash") {

        table =
            Array(REHASH_SIZE).fill(EMPTY);

        chainTable = [];

    }

    else if (currentTechnique === "chain") {

        table = [];

        chainTable =
            Array.from(
                { length: INITIAL_SIZE },
                () => []
            );

    }

    else {

        table =
            Array(INITIAL_SIZE).fill(EMPTY);

        chainTable = [];

    }


    for (const vehicle of activeVehicles) {

        insertIntoTable(vehicle);

    }

}


/* =========================================================
   INSERT
   ========================================================= */

function insertIntoTable(vehicle) {

    const key =
        extractKey(vehicle.vehicle);

    if (currentTechnique === "chain") {

        const index =
            hash(key, INITIAL_SIZE);

        chainTable[index].push(vehicle.vehicle);

        return {
            slot: index,
            probes: chainTable[index].length
        };

    }


    const size =
        currentTechnique === "rehash"
            ? REHASH_SIZE
            : INITIAL_SIZE;


    const start =
        hash(key, size);


    for (let i = 0; i < size; i++) {

        let index;


        if (currentTechnique === "linear" ||
            currentTechnique === "rehash") {

            index =
                (start + i) % size;

        }

        else if (currentTechnique === "quadratic") {

            index =
                (start + i * i) % size;

        }

        else if (currentTechnique === "double") {

            index =
                (
                    start +
                    i * secondHash(key)
                ) % size;

        }


        if (
            table[index] === EMPTY ||
            table[index] === DELETED
        ) {

            table[index] = vehicle.vehicle;

            return {
                slot: index,
                probes: i + 1
            };

        }

    }


    return null;

}


/* =========================================================
   SEARCH
   ========================================================= */

function searchVehicle(vehicle) {

    const key =
        extractKey(vehicle);


    if (currentTechnique === "chain") {

        const index =
            hash(key, INITIAL_SIZE);

        const position =
            chainTable[index].indexOf(vehicle);

        if (position !== -1) {

            const record =
                activeVehicles.find(
                    item => item.vehicle === vehicle
                );

            return {
                found: true,
                slot: index,
                probes: position + 1,
                record
            };

        }

        return {
            found: false
        };

    }


    const size =
        currentTechnique === "rehash"
            ? REHASH_SIZE
            : INITIAL_SIZE;

    const start =
        hash(key, size);


    for (let i = 0; i < size; i++) {

        let index;


        if (
            currentTechnique === "linear" ||
            currentTechnique === "rehash"
        ) {

            index =
                (start + i) % size;

        }

        else if (
            currentTechnique === "quadratic"
        ) {

            index =
                (start + i * i) % size;

        }

        else {

            index =
                (
                    start +
                    i * secondHash(key)
                ) % size;

        }


        if (table[index] === EMPTY) {

            return {
                found: false
            };

        }


        if (table[index] === vehicle) {

            const record =
                activeVehicles.find(
                    item => item.vehicle === vehicle
                );

            return {
                found: true,
                slot: index,
                probes: i + 1,
                record
            };

        }

    }


    return {
        found: false
    };

}


/* =========================================================
   DELETE
   ========================================================= */

function removeFromTable(vehicle) {

    const key =
        extractKey(vehicle);


    if (currentTechnique === "chain") {

        const index =
            hash(key, INITIAL_SIZE);

        const position =
            chainTable[index].indexOf(vehicle);

        if (position !== -1) {

            chainTable[index].splice(
                position,
                1
            );

            return true;

        }

        return false;

    }


    const result =
        searchVehicle(vehicle);

    if (!result.found) {
        return false;
    }

    table[result.slot] = DELETED;

    return true;

}


/* =========================================================
   PARK VEHICLE
   ========================================================= */

function parkVehicle(vehicleInput) {

    const vehicle =
        normalizeVehicle(vehicleInput);


    if (!vehicle) {

        showToast("Enter a vehicle number.");

        return false;

    }


    if (
        activeVehicles.some(
            item => item.vehicle === vehicle
        )
    ) {

        showToast(
            "This vehicle is already parked."
        );

        return false;

    }


    const record = {

        id:
            Date.now().toString() +
            Math.random().toString(16).slice(2),

        vehicle,

        entryTime:
            new Date().toISOString(),

        exitTime: null,

        slot: null,

        probes: 0,

        technique:
            currentTechnique

    };


    activeVehicles.push(record);

    rebuildTable();


    const result =
        searchVehicle(vehicle);


    if (result.found) {

        record.slot =
            result.slot;

        record.probes =
            result.probes;

    }


    saveData();

    renderAll();

    showToast(
        `${vehicle} parked successfully.`
    );

    return true;

}


/* =========================================================
   EXIT VEHICLE
   ========================================================= */

function exitVehicle(vehicleInput) {

    const vehicle =
        normalizeVehicle(vehicleInput);


    const index =
        activeVehicles.findIndex(
            item => item.vehicle === vehicle
        );


    if (index === -1) {

        showToast(
            "Vehicle is not currently parked."
        );

        return false;

    }


    const record =
        activeVehicles[index];


    const exitTime =
        new Date();


    record.exitTime =
        exitTime.toISOString();


    history.unshift({
        ...record
    });


    removeFromTable(vehicle);

    activeVehicles.splice(
        index,
        1
    );


    rebuildTable();

    saveData();

    renderAll();


    showToast(
        `${vehicle} exited. Duration: ${formatDuration(record.entryTime, record.exitTime)}`
    );

    return true;

}


/* =========================================================
   SEARCH UI
   ========================================================= */

function performSearch(vehicleInput) {

    const vehicle =
        normalizeVehicle(vehicleInput);

    if (!vehicle) {
        return;
    }


    const result =
        searchVehicle(vehicle);


    if (!result.found) {

        showSearchResultError(
            "Vehicle not found in the parking area."
        );

        return;

    }


    searchHighlightSlot =
        result.slot;


    $("searchResult").classList.remove(
        "hidden"
    );


    $("resultVehicle").textContent =
        vehicle;

    $("resultSlot").textContent =
        result.slot;

    $("resultProbes").textContent =
        result.probes;

    $("resultEntry").textContent =
        formatDateTime(
            result.record.entryTime
        );

    $("resultTechnique").textContent =
        techniqueShort(
            result.record.technique
        );


    const resultIcon =
        document.querySelector(
            ".result-icon"
        );

    resultIcon.textContent = "✓";

    resultIcon.style.color =
        "var(--green)";

    resultIcon.style.background =
        "rgba(45,220,139,0.1)";


    renderParking();

    showToast(
        `${vehicle} found in slot ${result.slot}.`
    );

}


/* =========================================================
   SEARCH ERROR
   ========================================================= */

function showSearchResultError(message) {

    $("searchResult").classList.remove(
        "hidden"
    );

    $("resultVehicle").textContent =
        "Vehicle Not Found";

    $("resultSlot").textContent = "—";
    $("resultProbes").textContent = "—";
    $("resultEntry").textContent = "—";
    $("resultTechnique").textContent = "—";


    const resultIcon =
        document.querySelector(
            ".result-icon"
        );

    resultIcon.textContent = "!";

    resultIcon.style.color =
        "var(--red)";

    resultIcon.style.background =
        "rgba(255,93,115,0.1)";


    showToast(message);

}


/* =========================================================
   TECHNIQUE
   ========================================================= */

function changeTechnique(technique) {

    currentTechnique =
        technique;

    rebuildTable();

    saveData();

    updateTechniqueUI();

    renderAll();

}


function techniqueShort(technique) {

    const names = {

        linear: "Linear",

        quadratic: "Quadratic",

        double: "Double Hash",

        chain: "Chaining",

        rehash: "Rehashing"

    };

    return names[technique] || technique;

}


function techniqueName(technique) {

    const names = {

        linear: "Linear Probing",

        quadratic: "Quadratic Probing",

        double: "Double Hashing",

        chain: "Separate Chaining",

        rehash: "Rehashing"

    };

    return names[technique] || technique;

}


function techniqueDescription(technique) {

    const descriptions = {

        linear:
            "Resolves collisions by checking the next available slot sequentially.",

        quadratic:
            "Uses quadratic jumps to find an available slot.",

        double:
            "Uses a second hash function to calculate the probing step.",

        chain:
            "Stores multiple collided vehicles inside a linked-style chain.",

        rehash:
            "Uses a larger 23-slot table with linear probing."

    };

    return descriptions[technique];

}


/* =========================================================
   RENDER PARKING
   ========================================================= */

function renderParking() {

    renderGrid(
        $("dashboardParkingGrid")
    );

    renderGrid(
        $("mainParkingGrid")
    );

}


function renderGrid(container) {

    if (!container) return;

    container.innerHTML = "";


    const size =
        currentTechnique === "rehash"
            ? REHASH_SIZE
            : INITIAL_SIZE;


    for (let i = 0; i < size; i++) {

        const slot =
            document.createElement("div");

        slot.className =
            "parking-slot";


        if (
            searchHighlightSlot === i
        ) {

            slot.classList.add(
                "search-highlight"
            );

        }


        let vehicles = [];


        if (currentTechnique === "chain") {

            vehicles =
                chainTable[i] || [];

        }

        else {

            const value =
                table[i];

            if (
                value !== EMPTY &&
                value !== DELETED
            ) {

                vehicles = [value];

            }

        }


        if (vehicles.length > 0) {

            slot.classList.add(
                "occupied"
            );

            slot.innerHTML = `

                <span class="slot-number">
                    ${i}
                </span>

                <div class="car-icon">
                    🚗
                </div>

                <div class="slot-vehicle">
                    ${vehicles.join(" • ")}
                </div>

            `;

        }

        else {

            slot.innerHTML = `

                <span class="slot-number">
                    ${i}
                </span>

                <div class="empty-slot">
                    EMPTY
                </div>

            `;

        }


        container.appendChild(slot);

    }

}


/* =========================================================
   RENDER ALL
   ========================================================= */

function renderAll() {

    renderParking();

    updateStats();

    updateTechniqueUI();

    renderHistory();

    updateProfileUI();

}


/* =========================================================
   STATS
   ========================================================= */

function updateStats() {

    const size =
        currentTechnique === "rehash"
            ? REHASH_SIZE
            : INITIAL_SIZE;


    $("totalSlots").textContent =
        size;

    $("occupiedSlots").textContent =
        activeVehicles.length;

    $("availableSlots").textContent =
        Math.max(
            size - activeVehicles.length,
            0
        );

    $("techniqueStat").textContent =
        techniqueShort(
            currentTechnique
        );

    $("parkingCapacity").textContent =
        `${activeVehicles.length} / ${size}`;

}


/* =========================================================
   TECHNIQUE UI
   ========================================================= */

function updateTechniqueUI() {

    $("techniqueSelect").value =
        currentTechnique;

    $("techniqueName").textContent =
        techniqueName(
            currentTechnique
        );

    $("techniqueDescription").textContent =
        techniqueDescription(
            currentTechnique
        );


    $("formulaText").textContent =
        currentTechnique === "rehash"
            ? "h(k) = k mod 23"
            : "h(k) = k mod 11";

}


/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {

    const tbody =
        $("historyTableBody");

    if (!tbody) return;

    tbody.innerHTML = "";


    const combined =
        [
            ...activeVehicles.map(item => ({
                ...item,
                active: true
            })),

            ...history.map(item => ({
                ...item,
                active: false
            }))
        ];


    $("historyTotal").textContent =
        combined.length;

    $("historyActive").textContent =
        activeVehicles.length;

    $("historyCompleted").textContent =
        history.length;


    if (combined.length === 0) {

        $("emptyHistory").classList.remove(
            "hidden"
        );

        return;

    }


    $("emptyHistory").classList.add(
        "hidden"
    );


    combined.forEach(
        (record, index) => {

            const row =
                document.createElement("tr");


            const status =
                record.active
                    ? `<span class="status-badge active">PARKED</span>`
                    : `<span class="status-badge completed">COMPLETED</span>`;


            row.innerHTML = `

                <td>${index + 1}</td>

                <td class="vehicle-cell">
                    ${record.vehicle}
                </td>

                <td>
                    ${record.slot ?? "—"}
                </td>

                <td>
                    ${formatDateTime(record.entryTime)}
                </td>

                <td>
                    ${
                        record.exitTime
                            ? formatDateTime(record.exitTime)
                            : "Still parked"
                    }
                </td>

                <td>
                    ${
                        formatDuration(
                            record.entryTime,
                            record.exitTime
                        )
                    }
                </td>

                <td>
                    ${techniqueShort(record.technique)}
                </td>

                <td>
                    ${status}
                </td>

            `;

            tbody.appendChild(row);

        }
    );

}


/* =========================================================
   CSV DOWNLOAD
   ========================================================= */

function downloadCSV() {

    const records = [
        ...activeVehicles.map(item => ({
            ...item,
            status: "PARKED"
        })),

        ...history.map(item => ({
            ...item,
            status: "COMPLETED"
        }))
    ];


    if (records.length === 0) {

        showToast(
            "No history available to download."
        );

        return;

    }


    const headers = [
        "Vehicle",
        "Slot",
        "Entry Time",
        "Exit Time",
        "Duration",
        "Technique",
        "Probes",
        "Status"
    ];


    const rows =
        records.map(record => [

            record.vehicle,

            record.slot ?? "",

            formatDateTime(
                record.entryTime
            ),

            record.exitTime
                ? formatDateTime(
                    record.exitTime
                )
                : "",

            formatDuration(
                record.entryTime,
                record.exitTime
            ),

            techniqueName(
                record.technique
            ),

            record.probes ?? "",

            record.status

        ]);


    const csv = [

        headers,

        ...rows

    ]
        .map(row =>
            row
                .map(value =>
                    `"${String(value)
                        .replace(/"/g, '""')}"`
                )
                .join(",")
        )
        .join("\n");


    const blob =
        new Blob(
            [csv],
            {
                type: "text/csv;charset=utf-8;"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const link =
        document.createElement("a");

    link.href = url;

    link.download =
        `parkhash-history-${dateForFile()}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);


    showToast(
        "History CSV downloaded."
    );

}


function dateForFile() {

    const now =
        new Date();

    return now
        .toISOString()
        .slice(0, 10);

}


/* =========================================================
   RESET HISTORY
   ========================================================= */

function resetHistory() {

    openConfirmModal(
        "Reset Parking History?",
        "All completed parking records will be permanently removed. Currently parked vehicles will not be removed.",
        () => {

            history = [];

            saveData();

            renderHistory();

            updateProfileUI();

            showToast(
                "Parking history has been reset."
            );

        }
    );

}


/* =========================================================
   RESET APPLICATION DATA
   ========================================================= */

function resetParkingData() {

    openConfirmModal(
        "Reset Parking Data?",
        "This will remove all current parking vehicles and complete history. Your account will remain safe.",
        () => {

            activeVehicles = [];
            history = [];

            rebuildTable();

            saveData();

            renderAll();

            showToast(
                "Parking data has been reset."
            );

        }
    );

}


/* =========================================================
   FORMAT DATE / TIME
   ========================================================= */

function formatDateTime(value) {

    if (!value) return "—";

    const date =
        new Date(value);


    if (settings.time24) {

        return date.toLocaleString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            }
        );

    }


    return date.toLocaleString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );

}


/* =========================================================
   DURATION
   ========================================================= */

function formatDuration(
    entry,
    exit = null
) {

    const start =
        new Date(entry).getTime();

    const end =
        exit
            ? new Date(exit).getTime()
            : Date.now();


    let seconds =
        Math.max(
            Math.floor(
                (end - start) / 1000
            ),
            0
        );


    const hours =
        Math.floor(
            seconds / 3600
        );

    seconds %= 3600;


    const minutes =
        Math.floor(
            seconds / 60
        );

    seconds %= 60;


    if (hours > 0) {

        return `${hours}h ${minutes}m ${seconds}s`;

    }


    if (minutes > 0) {

        return `${minutes}m ${seconds}s`;

    }


    return `${seconds}s`;

}


/* =========================================================
   PROFILE
   ========================================================= */

function updateProfileUI() {

    if (!currentUser) return;


    const initials =
        getInitials(
            currentUser.name
        );


    $("sidebarAvatar").textContent =
        initials;

    $("profileAvatar").textContent =
        initials;


    $("sidebarName").textContent =
        currentUser.name;

    $("sidebarEmail").textContent =
        currentUser.email;


    $("profileName").textContent =
        currentUser.name;

    $("profileEmail").textContent =
        currentUser.email;


    $("profileNameInput").value =
        currentUser.name;

    $("profileEmailInput").value =
        currentUser.email;

    $("profilePhoneInput").value =
        currentUser.phone || "";


    $("profileSessions").textContent =
        activeVehicles.length +
        history.length;

    $("profileCompleted").textContent =
        history.length;

    $("profileActive").textContent =
        activeVehicles.length;

}


function getInitials(name) {

    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(
            word =>
                word[0]
        )
        .join("")
        .toUpperCase();

}


/* =========================================================
   SETTINGS
   ========================================================= */

function setupControls() {

    $("techniqueSelect")
        .addEventListener(
            "change",
            event => {

                changeTechnique(
                    event.target.value
                );

            }
        );


    $("downloadCsvBtn")
        .addEventListener(
            "click",
            downloadCSV
        );


    $("resetHistoryBtn")
        .addEventListener(
            "click",
            resetHistory
        );


    $("settingsResetBtn")
        .addEventListener(
            "click",
            resetParkingData
        );


    $("resetAppBtn")
        .addEventListener(
            "click",
            resetParkingData
        );


    $("themeSelect")
        .addEventListener(
            "change",
            event => {

                settings.theme =
                    event.target.value;

                saveSettings();

                applySettings();

                showToast(
                    "Theme updated."
                );

            }
        );


    $("compactToggle")
        .addEventListener(
            "change",
            event => {

                settings.compact =
                    event.target.checked;

                saveSettings();

                applySettings();

            }
        );


    $("notificationToggle")
        .addEventListener(
            "change",
            event => {

                settings.notifications =
                    event.target.checked;

                saveSettings();

            }
        );


    $("autoSaveToggle")
        .addEventListener(
            "change",
            event => {

                settings.autoSave =
                    event.target.checked;

                saveSettings();

                if (settings.autoSave) {
                    saveData();
                }

            }
        );


    $("timeToggle")
        .addEventListener(
            "change",
            event => {

                settings.time24 =
                    event.target.checked;

                saveSettings();

                renderHistory();

            }
        );


    $("defaultTechnique")
        .addEventListener(
            "change",
            event => {

                settings.defaultTechnique =
                    event.target.value;

                saveSettings();

                showToast(
                    "Default technique saved."
                );

            }
        );


    $("profileForm")
        .addEventListener(
            "submit",
            event => {

                event.preventDefault();

                const name =
                    $("profileNameInput")
                        .value
                        .trim();

                const phone =
                    $("profilePhoneInput")
                        .value
                        .trim();


                if (name.length < 2) {

                    showToast(
                        "Please enter a valid name."
                    );

                    return;

                }


                currentUser.name =
                    name;

                currentUser.phone =
                    phone;


                localStorage.setItem(
                    CURRENT_USER_KEY,
                    JSON.stringify(
                        currentUser
                    )
                );


                const account =
                    getAccount();


                if (account) {

                    account.name =
                        name;

                    account.phone =
                        phone;

                    localStorage.setItem(
                        ACCOUNT_KEY,
                        JSON.stringify(
                            account
                        )
                    );

                }


                updateProfileUI();

                showToast(
                    "Profile updated successfully."
                );

            }
        );


    $("loadDemoBtn")
        .addEventListener(
            "click",
            loadDemoData
        );

}


function saveSettings() {

    localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(settings)
    );

}


function applySettings() {

    document.body.dataset.theme =
        settings.theme;

    document.body.classList.toggle(
        "compact-mode",
        settings.compact
    );


    if ($("themeSelect")) {

        $("themeSelect").value =
            settings.theme;

    }


    if ($("compactToggle")) {

        $("compactToggle").checked =
            settings.compact;

    }


    if ($("notificationToggle")) {

        $("notificationToggle").checked =
            settings.notifications;

    }


    if ($("autoSaveToggle")) {

        $("autoSaveToggle").checked =
            settings.autoSave;

    }


    if ($("timeToggle")) {

        $("timeToggle").checked =
            settings.time24;

    }


    if ($("defaultTechnique")) {

        $("defaultTechnique").value =
            settings.defaultTechnique;

    }

}


/* =========================================================
   FORMS
   ========================================================= */

function setupForms() {

    $("parkForm")
        .addEventListener(
            "submit",
            event => {

                event.preventDefault();

                const input =
                    $("parkVehicle");

                if (
                    parkVehicle(
                        input.value
                    )
                ) {

                    input.value = "";

                }

            }
        );


    $("quickParkForm")
        .addEventListener(
            "submit",
            event => {

                event.preventDefault();

                const input =
                    $("quickVehicle");

                if (
                    parkVehicle(
                        input.value
                    )
                ) {

                    input.value = "";

                }

            }
        );


    $("searchForm")
        .addEventListener(
            "submit",
            event => {

                event.preventDefault();

                performSearch(
                    $("searchVehicle")
                        .value
                );

            }
        );


    $("removeForm")
        .addEventListener(
            "submit",
            event => {

                event.preventDefault();

                const input =
                    $("removeVehicle");

                if (
                    exitVehicle(
                        input.value
                    )
                ) {

                    input.value = "";

                }

            }
        );

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

    document
        .querySelectorAll(".nav-item")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    navigateTo(
                        button.dataset.section
                    );

                }
            );

        });

}


function navigateTo(section) {

    document
        .querySelectorAll(".page-section")
        .forEach(page => {

            page.classList.remove(
                "active-section"
            );

        });


    const target =
        $(section);

    if (target) {

        target.classList.add(
            "active-section"
        );

    }


    document
        .querySelectorAll(".nav-item")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.section === section
            );

        });


    const names = {

        dashboard: "Dashboard",

        parking: "Parking Area",

        operations: "Operations",

        history: "History",

        profile: "Profile",

        settings: "Settings",

        project: "Project"

    };


    $("currentPageName").textContent =
        names[section] || "Dashboard";

    $("pageTitle").textContent =
        names[section] || "Dashboard";


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


function setupQuickNavigation() {

    document
        .querySelectorAll("[data-go]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    navigateTo(
                        button.dataset.go
                    );

                }
            );

        });

}


/* =========================================================
   PASSWORD BUTTONS
   ========================================================= */

function setupPasswordButtons() {

    document
        .querySelectorAll(".password-toggle")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const input =
                        $(button.dataset.target);

                    if (
                        input.type === "password"
                    ) {

                        input.type =
                            "text";

                        button.textContent =
                            "Hide";

                    }

                    else {

                        input.type =
                            "password";

                        button.textContent =
                            "Show";

                    }

                }
            );

        });

}


/* =========================================================
   DEMO
   ========================================================= */

function loadDemoData() {

    openConfirmModal(
        "Load Demo Data?",
        "This will add sample vehicles to the current parking system.",
        () => {

            const demoVehicles = [
                "KA01AB1021",
                "KA05MN2210",
                "TN09XY1532",
                "AP28CD4821",
                "MH12PQ7123"
            ];


            for (
                const vehicle
                of demoVehicles
            ) {

                if (
                    !activeVehicles.some(
                        item =>
                            item.vehicle === vehicle
                    )
                ) {

                    const record = {

                        id:
                            Date.now() +
                            Math.random(),

                        vehicle,

                        entryTime:
                            new Date(
                                Date.now() -
                                Math.floor(
                                    Math.random() *
                                    3600000
                                )
                            ).toISOString(),

                        exitTime: null,

                        slot: null,

                        probes: 0,

                        technique:
                            currentTechnique

                    };

                    activeVehicles.push(
                        record
                    );

                }

            }


            rebuildTable();


            activeVehicles.forEach(
                record => {

                    const result =
                        searchVehicle(
                            record.vehicle
                        );

                    if (result.found) {

                        record.slot =
                            result.slot;

                        record.probes =
                            result.probes;

                    }

                }
            );


            saveData();

            renderAll();

            showToast(
                "Demo vehicles loaded."
            );

        }
    );

}


/* =========================================================
   MODAL
   ========================================================= */

let modalAction = null;


function setupModal() {

    $("modalCancel")
        .addEventListener(
            "click",
            closeConfirmModal
        );


    $("modalConfirm")
        .addEventListener(
            "click",
            () => {

                if (modalAction) {
                    modalAction();
                }

                closeConfirmModal();

            }
        );

}


function openConfirmModal(
    title,
    message,
    action
) {

    $("modalTitle").textContent =
        title;

    $("modalMessage").textContent =
        message;

    modalAction =
        action;

    $("confirmModal")
        .classList.remove(
            "hidden"
        );

}


function closeConfirmModal() {

    $("confirmModal")
        .classList.add(
            "hidden"
        );

    modalAction = null;

}


/* =========================================================
   TOAST
   ========================================================= */

let toastTimer;


function showToast(message) {

    if (
        currentUser &&
        settings.notifications === false
    ) {
        return;
    }


    const toast =
        $("toast");


    $("toastMessage")
        .textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            3000
        );

}