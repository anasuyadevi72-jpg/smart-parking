const INITIAL_SIZE = 11;
const REHASH_SIZE = 23;

const EMPTY = null;
const DELETED = Symbol("deleted");

let currentTechnique = "linear";

let table = [];
let chainTable = [];
let activities = [];


/* =========================
   INITIALIZATION
========================= */

function initializeTables() {

    table = new Array(
        currentTechnique === "rehashing"
            ? REHASH_SIZE
            : INITIAL_SIZE
    ).fill(EMPTY);

    chainTable = Array.from(
        { length: INITIAL_SIZE },
        () => []
    );

    renderParking();
    updateStats();
    updateTechniqueUI();
}


document.addEventListener("DOMContentLoaded", () => {

    initializeTables();

    setupNavigation();
    setupOperations();
    setupTechniqueButtons();

    addActivity(
        "SYSTEM",
        "System initialized",
        "Ready",
        true
    );

});


/* =========================
   VEHICLE / HASH FUNCTIONS
========================= */

function normalizeVehicle(vehicle) {

    return vehicle
        .toUpperCase()
        .replace(/\s+/g, "")
        .trim();

}


function getNumericKey(vehicle) {

    const digits = vehicle.match(/\d+/g);

    if (digits) {
        return parseInt(digits.join(""), 10);
    }

    let key = 0;

    for (let i = 0; i < vehicle.length; i++) {
        key += vehicle.charCodeAt(i) * (i + 1);
    }

    return key;
}


function hash(key, size) {

    return key % size;

}


function secondHash(key) {

    return 7 - (key % 7);

}


function getTableSize() {

    return currentTechnique === "rehashing"
        ? REHASH_SIZE
        : INITIAL_SIZE;

}


/* =========================
   OPEN ADDRESSING
========================= */

function getProbeIndex(key, i, technique, size) {

    const h = hash(key, size);

    if (technique === "linear") {
        return (h + i) % size;
    }

    if (technique === "quadratic") {
        return (h + i * i) % size;
    }

    if (technique === "double") {
        return (
            h +
            i * secondHash(key)
        ) % size;
    }

    return (
        h +
        i
    ) % size;
}


function insertOpenAddressing(vehicle) {

    const key = getNumericKey(vehicle);
    const size = getTableSize();

    for (let i = 0; i < size; i++) {

        let index;

        if (currentTechnique === "rehashing") {

            index = getProbeIndex(
                key,
                i,
                "linear",
                size
            );

        } else {

            index = getProbeIndex(
                key,
                i,
                currentTechnique,
                size
            );

        }

        if (
            table[index] === EMPTY ||
            table[index] === DELETED
        ) {

            table[index] = vehicle;

            return {
                slot: index,
                probes: i + 1
            };

        }

    }

    return null;
}


function searchOpenAddressing(vehicle) {

    const key = getNumericKey(vehicle);
    const size = getTableSize();

    for (let i = 0; i < size; i++) {

        let index;

        if (currentTechnique === "rehashing") {

            index = getProbeIndex(
                key,
                i,
                "linear",
                size
            );

        } else {

            index = getProbeIndex(
                key,
                i,
                currentTechnique,
                size
            );

        }

        const value = table[index];

        if (value === EMPTY) {
            return null;
        }

        if (
            value !== DELETED &&
            value === vehicle
        ) {

            return {
                slot: index,
                probes: i + 1
            };

        }

    }

    return null;
}


function removeOpenAddressing(vehicle) {

    const result = searchOpenAddressing(vehicle);

    if (!result) {
        return false;
    }

    table[result.slot] = DELETED;

    return true;
}


/* =========================
   SEPARATE CHAINING
========================= */

function insertChaining(vehicle) {

    const key = getNumericKey(vehicle);

    const index = hash(
        key,
        INITIAL_SIZE
    );

    chainTable[index].push(vehicle);

    return {
        slot: index,
        probes: chainTable[index].length
    };

}


function searchChaining(vehicle) {

    const key = getNumericKey(vehicle);

    const index = hash(
        key,
        INITIAL_SIZE
    );

    const bucket = chainTable[index];

    for (
        let i = 0;
        i < bucket.length;
        i++
    ) {

        if (bucket[i] === vehicle) {

            return {
                slot: index,
                probes: i + 1
            };

        }

    }

    return null;
}


function removeChaining(vehicle) {

    const key = getNumericKey(vehicle);

    const index = hash(
        key,
        INITIAL_SIZE
    );

    const bucket = chainTable[index];

    const position = bucket.indexOf(vehicle);

    if (position === -1) {
        return false;
    }

    bucket.splice(position, 1);

    return true;
}


/* =========================
   GENERIC OPERATIONS
========================= */

function insertVehicle(vehicle) {

    if (currentTechnique === "chaining") {
        return insertChaining(vehicle);
    }

    return insertOpenAddressing(vehicle);
}


function searchVehicleInternal(vehicle) {

    if (currentTechnique === "chaining") {
        return searchChaining(vehicle);
    }

    return searchOpenAddressing(vehicle);
}


function removeVehicleInternal(vehicle) {

    if (currentTechnique === "chaining") {
        return removeChaining(vehicle);
    }

    return removeOpenAddressing(vehicle);
}


function getAllVehicles() {

    const vehicles = [];

    if (currentTechnique === "chaining") {

        chainTable.forEach(bucket => {

            bucket.forEach(vehicle => {
                vehicles.push(vehicle);
            });

        });

    } else {

        table.forEach(value => {

            if (
                value !== EMPTY &&
                value !== DELETED
            ) {

                vehicles.push(value);

            }

        });

    }

    return vehicles;

}


function vehicleExists(vehicle) {

    return !!searchVehicleInternal(vehicle);

}


/* =========================
   PARK
========================= */

function parkVehicle(vehicle, silent = false) {

    vehicle = normalizeVehicle(vehicle);

    if (!vehicle) {

        if (!silent) {
            showToast(
                "Enter a vehicle registration number",
                "error"
            );
        }

        return;

    }

    if (vehicleExists(vehicle)) {

        if (!silent) {

            showToast(
                "Vehicle is already parked",
                "error"
            );

        }

        addActivity(
            "PARK",
            vehicle,
            "Already parked",
            false
        );

        return;

    }

    const result = insertVehicle(vehicle);

    if (!result) {

        if (!silent) {

            showToast(
                "Parking area is full",
                "error"
            );

        }

        addActivity(
            "PARK",
            vehicle,
            "Parking full",
            false
        );

        return;

    }

    renderParking();
    updateStats();

    addActivity(
        "PARK",
        vehicle,
        `Slot ${result.slot}`,
        true
    );

    if (!silent) {

        showToast(
            `${vehicle} parked at Slot ${result.slot}`
        );

        clearInputs(vehicle);

        highlightSlot(result.slot);

    }

}


/* =========================
   SEARCH
========================= */

function searchVehicle(vehicle) {

    vehicle = normalizeVehicle(vehicle);

    if (!vehicle) {

        showSearchError(
            "Please enter a vehicle number"
        );

        return;

    }

    const result = searchVehicleInternal(vehicle);

    const resultBox =
        document.getElementById("searchResult");

    if (!result) {

        showSearchError(
            `Vehicle ${vehicle} was not found`
        );

        addActivity(
            "SEARCH",
            vehicle,
            "Not found",
            false
        );

        return;

    }

    resultBox.className =
        "search-result search-result-success";

    resultBox.classList.remove("hidden");

    document.getElementById("resultStatus").textContent =
        "Vehicle Found";

    document.getElementById("resultVehicle").textContent =
        vehicle;

    document.getElementById("resultSlot").textContent =
        result.slot;

    document.getElementById("resultProbes").textContent =
        result.probes;

    document.getElementById("resultTechnique").textContent =
        getTechniqueName();

    addActivity(
        "SEARCH",
        vehicle,
        `Found at Slot ${result.slot}`,
        true
    );

    highlightSlot(result.slot);

}


function showSearchError(message) {

    const box =
        document.getElementById("searchResult");

    box.className =
        "search-result search-result-error";

    box.classList.remove("hidden");

    document.querySelector(".result-icon").textContent =
        "!";

    document.getElementById("resultStatus").textContent =
        "Vehicle Not Found";

    document.getElementById("resultStatus").style.color =
        "#fca5a5";

    document.getElementById("resultVehicle").textContent =
        message;

    document.getElementById("resultSlot").textContent =
        "—";

    document.getElementById("resultProbes").textContent =
        "—";

    document.getElementById("resultTechnique").textContent =
        getTechniqueName();

}


/* =========================
   REMOVE
========================= */

function removeVehicle(vehicle) {

    vehicle = normalizeVehicle(vehicle);

    if (!vehicle) {

        showToast(
            "Enter a vehicle registration number",
            "error"
        );

        return;

    }

    const result =
        searchVehicleInternal(vehicle);

    if (!result) {

        showToast(
            "Vehicle not found",
            "error"
        );

        addActivity(
            "REMOVE",
            vehicle,
            "Not found",
            false
        );

        return;

    }

    const removed =
        removeVehicleInternal(vehicle);

    if (!removed) {
        return;
    }

    renderParking();
    updateStats();

    addActivity(
        "REMOVE",
        vehicle,
        `Released Slot ${result.slot}`,
        true
    );

    showToast(
        `${vehicle} removed from Slot ${result.slot}`
    );

    clearInputs(vehicle);

}


/* =========================
   CHANGE TECHNIQUE
========================= */

function changeTechnique(newTechnique) {

    if (newTechnique === currentTechnique) {
        return;
    }

    const vehicles = getAllVehicles();

    currentTechnique = newTechnique;

    initializeTables();

    vehicles.forEach(vehicle => {
        insertVehicle(vehicle);
    });

    renderParking();
    updateStats();
    updateTechniqueUI();

    addActivity(
        "TECHNIQUE",
        "Hash Engine",
        getTechniqueName(),
        true
    );

    showToast(
        `Technique changed to ${getTechniqueName()}`
    );

}


/* =========================
   RENDER PARKING
========================= */

function createSlot(index, value) {

    const slot =
        document.createElement("div");

    slot.className = "parking-slot";

    if (
        value !== EMPTY &&
        value !== DELETED &&
        value
    ) {

        slot.classList.add("occupied");

        slot.innerHTML = `
            <span class="slot-number">SLOT ${index}</span>
            <div class="car-icon">🚗</div>
            <div class="vehicle-number">${value}</div>
        `;

    } else {

        slot.innerHTML = `
            <span class="slot-number">SLOT ${index}</span>
            <div class="car-icon">⌁</div>
            <div class="vehicle-number">AVAILABLE</div>
        `;

    }

    return slot;
}


function renderParking() {

    const dashboardGrid =
        document.getElementById(
            "dashboardParkingGrid"
        );

    const largeGrid =
        document.getElementById(
            "largeParkingGrid"
        );

    if (!dashboardGrid || !largeGrid) {
        return;
    }

    dashboardGrid.innerHTML = "";
    largeGrid.innerHTML = "";


    if (currentTechnique === "chaining") {

        for (
            let i = 0;
            i < INITIAL_SIZE;
            i++
        ) {

            const value =
                chainTable[i].length
                    ? chainTable[i].join(" • ")
                    : null;

            const slot =
                createSlot(i, value);

            dashboardGrid.appendChild(
                slot.cloneNode(true)
            );

            largeGrid.appendChild(
                slot
            );

        }

    } else {

        table.forEach((value, index) => {

            const slot =
                createSlot(index, value);

            dashboardGrid.appendChild(
                slot.cloneNode(true)
            );

            largeGrid.appendChild(
                slot
            );

        });

    }

}


/* =========================
   HIGHLIGHT
========================= */

function highlightSlot(slotNumber) {

    document
        .querySelectorAll(".search-highlight")
        .forEach(element => {
            element.classList.remove(
                "search-highlight"
            );
        });


    const grids = [
        document.getElementById(
            "dashboardParkingGrid"
        ),
        document.getElementById(
            "largeParkingGrid"
        )
    ];


    grids.forEach(grid => {

        if (!grid) return;

        const slots =
            grid.querySelectorAll(
                ".parking-slot"
            );

        const slot =
            slots[slotNumber];

        if (!slot) return;

        slot.classList.add(
            "search-highlight"
        );

    });


    const largeGrid =
        document.getElementById(
            "largeParkingGrid"
        );

    if (largeGrid) {

        const slot =
            largeGrid.querySelectorAll(
                ".parking-slot"
            )[slotNumber];

        if (slot) {

            slot.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

        }

    }


    setTimeout(() => {

        document
            .querySelectorAll(
                ".search-highlight"
            )
            .forEach(element => {

                element.classList.remove(
                    "search-highlight"
                );

            });

    }, 3500);

}


/* =========================
   STATS
========================= */

function updateStats() {

    const vehicles =
        getAllVehicles();

    const total =
        currentTechnique === "rehashing"
            ? REHASH_SIZE
            : INITIAL_SIZE;

    const occupied =
        vehicles.length;

    const available =
        total - occupied;

    const percentage =
        Math.round(
            (occupied / total) * 100
        );


    document.getElementById(
        "totalSlots"
    ).textContent = total;

    document.getElementById(
        "occupiedSlots"
    ).textContent = occupied;

    document.getElementById(
        "availableSlots"
    ).textContent = available;

    document.getElementById(
        "occupancyText"
    ).textContent =
        `${percentage}% occupancy`;

    document.getElementById(
        "availabilityText"
    ).textContent =
        `${available} slots available`;

    document.getElementById(
        "largeOccupied"
    ).textContent = occupied;

    document.getElementById(
        "largeAvailable"
    ).textContent = available;

    document.getElementById(
        "techniqueStat"
    ).textContent =
        getShortTechniqueName();

}


/* =========================
   TECHNIQUE UI
========================= */

function getTechniqueName() {

    const names = {

        linear: "Linear Probing",

        quadratic: "Quadratic Probing",

        double: "Double Hashing",

        chaining: "Separate Chaining",

        rehashing: "Rehashing"

    };

    return names[currentTechnique];

}


function getShortTechniqueName() {

    const names = {

        linear: "Linear",

        quadratic: "Quadratic",

        double: "Double Hash",

        chaining: "Chaining",

        rehashing: "Rehashing"

    };

    return names[currentTechnique];

}


function updateTechniqueUI() {

    document
        .querySelectorAll(
            ".technique-option"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.technique ===
                currentTechnique
            );

        });

}


/* =========================
   NAVIGATION
========================= */

function setupNavigation() {

    const buttons =
        document.querySelectorAll(
            ".nav-item"
        );

    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const section =
                    button.dataset.section;

                showSection(section);

            }
        );

    });

}


function showSection(section) {

    document
        .querySelectorAll(
            ".page-section"
        )
        .forEach(page => {

            page.classList.toggle(
                "active",
                page.id === section
            );

        });


    document
        .querySelectorAll(
            ".nav-item"
        )
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.section === section
            );

        });


    const titles = {

        dashboard:
            "Smart Parking Dashboard",

        parking:
            "Parking Area",

        operations:
            "Parking Operations",

        activity:
            "System Activity",

        project:
            "Project Overview"

    };


    document.getElementById(
        "page-title"
    ).textContent =
        titles[section];

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


function scrollToSection(section) {

    showSection(section);

}


/* =========================
   OPERATIONS SETUP
========================= */

function setupOperations() {

    document.getElementById(
        "quickParkBtn"
    ).addEventListener(
        "click",
        () => {

            parkVehicle(
                document.getElementById(
                    "quickVehicle"
                ).value
            );

        }
    );


    document.getElementById(
        "quickSearchBtn"
    ).addEventListener(
        "click",
        () => {

            searchVehicle(
                document.getElementById(
                    "quickVehicle"
                ).value
            );

        }
    );


    document.getElementById(
        "quickRemoveBtn"
    ).addEventListener(
        "click",
        () => {

            removeVehicle(
                document.getElementById(
                    "quickVehicle"
                ).value
            );

        }
    );


    document.getElementById(
        "parkBtn"
    ).addEventListener(
        "click",
        () => {

            parkVehicle(
                document.getElementById(
                    "parkVehicle"
                ).value
            );

        }
    );


    document.getElementById(
        "searchBtn"
    ).addEventListener(
        "click",
        () => {

            searchVehicle(
                document.getElementById(
                    "searchVehicle"
                ).value
            );

        }
    );


    document.getElementById(
        "removeBtn"
    ).addEventListener(
        "click",
        () => {

            removeVehicle(
                document.getElementById(
                    "removeVehicle"
                ).value
            );

        }
    );


    document
        .querySelectorAll("input")
        .forEach(input => {

            input.addEventListener(
                "keydown",
                event => {

                    if (
                        event.key === "Enter"
                    ) {

                        const parent =
                            input.closest(
                                ".operation-card"
                            );

                        if (parent) {

                            const button =
                                parent.querySelector(
                                    "button"
                                );

                            if (button) {
                                button.click();
                            }

                        }

                    }

                }
            );

        });


    document.getElementById(
        "resetBtn"
    ).addEventListener(
        "click",
        resetSystem
    );


    document.getElementById(
        "loadDemoBtn"
    ).addEventListener(
        "click",
        loadDemo
    );

}


/* =========================
   TECHNIQUE BUTTONS
========================= */

function setupTechniqueButtons() {

    document
        .querySelectorAll(
            ".technique-option"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    changeTechnique(
                        button.dataset.technique
                    );

                }
            );

        });

}


/* =========================
   ACTIVITY
========================= */

function addActivity(
    operation,
    vehicle,
    result,
    success
) {

    const now =
        new Date();

    const time =
        now.toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );


    activities.unshift({

        time,
        operation,
        vehicle,
        result,
        success

    });


    activities =
        activities.slice(0, 30);

    renderActivities();

}


function renderActivities() {

    const list =
        document.getElementById(
            "activityList"
        );

    if (!list) return;

    if (!activities.length) {

        list.innerHTML = `
            <div class="empty-activity">
                No activity yet.
            </div>
        `;

        return;

    }


    list.innerHTML =
        activities.map(item => `

            <div class="activity-row">

                <span>${item.time}</span>

                <strong>${item.operation}</strong>

                <span>${item.vehicle}</span>

                <span class="${
                    item.success
                        ? "activity-success"
                        : "activity-error"
                }">
                    ${item.result}
                </span>

            </div>

        `).join("");

}


/* =========================
   TOAST
========================= */

function showToast(
    message,
    type = "success"
) {

    const toast =
        document.getElementById(
            "toast"
        );

    const text =
        document.getElementById(
            "toastMessage"
        );

    const icon =
        document.querySelector(
            ".toast-icon"
        );

    text.textContent = message;

    icon.textContent =
        type === "error"
            ? "!"
            : "✓";

    icon.style.color =
        type === "error"
            ? "#f87171"
            : "#22c55e";

    icon.style.background =
        type === "error"
            ? "rgba(239,68,68,0.12)"
            : "rgba(34,197,94,0.12)";

    toast.classList.add("show");

    clearTimeout(
        window.toastTimer
    );

    window.toastTimer =
        setTimeout(() => {

            toast.classList.remove(
                "show"
            );

        }, 3000);

}


/* =========================
   INPUT CLEAR
========================= */

function clearInputs(vehicle) {

    document
        .querySelectorAll("input")
        .forEach(input => {

            if (
                normalizeVehicle(
                    input.value
                ) === vehicle
            ) {

                input.value = "";

            }

        });

}


/* =========================
   RESET
========================= */

function resetSystem() {

    currentTechnique = "linear";

    activities = [];

    initializeTables();

    addActivity(
        "SYSTEM",
        "Parking System",
        "Reset complete",
        true
    );

    document
        .querySelectorAll("input")
        .forEach(input => {
            input.value = "";
        });


    const result =
        document.getElementById(
            "searchResult"
        );

    result.classList.add(
        "hidden"
    );

    showToast(
        "Parking system has been reset"
    );

}


/* =========================
   DEMO
========================= */

function loadDemo() {

    resetSystem();

    const demoVehicles = [

        "KA01AB1021",
        "KA05MN1032",
        "AP09CD1007",
        "TS08EF1018",
        "KA03XY1040",
        "TN10PQ1029"

    ];


    demoVehicles.forEach(
        vehicle => {

            parkVehicle(
                vehicle,
                true
            );

        }
    );


    renderParking();
    updateStats();

    addActivity(
        "DEMO",
        "Sample Dataset",
        `${demoVehicles.length} vehicles loaded`,
        true
    );

    showToast(
        "Demo parking data loaded"
    );

}


/* =========================
   KEYBOARD SHORTCUT
========================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.ctrlKey &&
            event.key.toLowerCase() === "k"
        ) {

            event.preventDefault();

            document
                .getElementById(
                    "quickVehicle"
                )
                .focus();

        }

    }
);