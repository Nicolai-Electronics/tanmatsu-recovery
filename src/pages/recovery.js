"use strict";

import { ESPLoader, Transport } from "/esptool/bundle.js";

const espLoaderTerminal = {
    clean() {

    },
    writeLine(data) {
        this.write(data + "\n");
        /*$(document).Toasts('create', {
            title: 'Debug',
            body: data,
            autohide: true,
            delay: 2000,
        })*/
    },
    write(data) {
        console.log(data);
        let consoleOutput = document.getElementById("console-output");
        if (consoleOutput) {
            consoleOutput.innerHTML = "<pre>" + data + "</pre>";
        } else {
            console.log("No console output element", consoleOutput);
        }
    },
};

export class Recovery {
    constructor(app) {
        this.app = app;
        this.transport = null;
        this.device = null;
        this.chip = null;
        this.serialLib = (!navigator.serial && navigator.usb) ? serial : (navigator.serial ? navigator.serial : null);
        this.isConnecting = false;
        this.isErasing = false;
        this.instructions = null;
        this.lastError = null;
        this.render();
    }

    async update() {
        if (app.page === this) {
            this.render();
        } else {
            console.log("Ignored update because page has been switched", app.page);
        }
    }

    destructor(forced) {
        return true;
    }

    async disconnect() {
        if (this.transport !== null) {
            await this.transport.disconnect();
            await this.transport.waitForUnlock(1500);
            this.transport = null;
            if (this.device !== null) {
                try {
                    await this.device.close();
                } catch (e) {
                    console.log("Device close", e.message);
                }
                this.device = null;
            }

        }

        this.transport = null;
        this.esploader = null;
        this.chip = null;

        this.render();
    }

    async connect() {
        this.isConnecting = true;
        await this.render();

        await this.disconnect();

        try {
            // Set up device and transport
            if (this.device === null) {
                const portFilters = { usbVendorId: 0x303a, usbProductId: 0x1001 };
                this.device = await this.serialLib.requestPort({ filters: [portFilters] });
            }

            if (this.transport === null) {
                this.transport = new Transport(this.device, true);
            }
            const romBaudrate = 115200;
            const loaderOptions = {
                transport: this.transport,
                baudrate: romBaudrate,
                terminal: espLoaderTerminal,
                debugLogging: false,
            };

            this.esploader = new ESPLoader(loaderOptions);
            this.chip = await this.esploader.main("default_reset");

            console.log("Settings done for :" + this.chip);
        } catch (e) {
            console.error(e);
            this.device = null;
            this.esploader = null;
            this.chip = null;
            this.showError(e.message);
        }

        this.isConnecting = false;
        this.render();
    }

    async eraseFlash() {
        this.isErasing = true;
        await this.render();
        await this.esploader.eraseFlash();
        this.isErasing = false;
        this.render();
    }

    async flashFile() {
        let fileInput = document.getElementById("flash-file");
        let addressInput = document.getElementById("flash-address");
        let fileObj = fileInput.files[0];
        if (!fileObj) {
            alert("Please select a file to flash.");
            return;
        }
        if (!addressInput.value) {
            alert("Please enter a flash address to write to.");
            return;
        }

        let offset = parseInt(addressInput.value, 16);

        const reader = new FileReader();

        app.renderer.modal_add({
            id: "flashing",
            content: "Preparing..."
        });
        app.renderer.modal_show("flashing");

        reader.onload = async (event) => {
            this.data = event.target.result;
            let flashOptions = {
                fileArray: [
                    {
                        data: event.target.result,
                        address: offset
                    }
                ],
                flashSize: "keep",
                eraseAll: false,
                compress: true,
                reportProgress: (fileIndex, written, total) => {
                    let percent = Math.round((written / total) * 100);
                    console.log("Flashing " + percent + "%...");
                    app.renderer.modal_update("flashing", {
                        content: "Flashing " + percent + "%..."
                    });
                }
            }
            await this.esploader.writeFlash(flashOptions);
            await this.esploader.after();
            app.renderer.modal_hide("flashing");
        }

        reader.readAsBinaryString(fileObj);
    }

    ui8ToBstr(u8Array) {
        let bStr = "";
        for (let i = 0; i < u8Array.length; i++) {
            bStr += String.fromCharCode(u8Array[i]);
        }
        return bStr;
    }

    async flashFirmware(name, optional = false) {
        await this.get_instructions(name);

        app.renderer.modal_add({
            id: "flashing",
            content: "Preparing..."
        });
        app.renderer.modal_show("flashing");


        let config = [];

        for (let i = 0; i < this.instructions.steps.length; i++) {
            if (!optional && this.instructions.steps[i].optional) {
                continue;
            }
            let url = "/firmware/" + name + "/" + this.instructions.steps[i].file;
            let offset = this.instructions.steps[i].offset;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }
            let data = await response.arrayBuffer();
            this.data = new Uint8Array(data);
            data = this.ui8ToBstr(new Uint8Array(data));
            config.push({ data: data, address: offset });
        }
        this.d = config;
        let flashOptions = {
            fileArray: config,
            flashSize: "keep",
            eraseAll: false,
            compress: true,
            reportProgress: (fileIndex, written, total) => {
                let percent = Math.round((written / total) * 100);
                console.log("Flashing " + percent + "%...");
                app.renderer.modal_update("flashing", {
                    content: "Flashing " + percent + "%..."
                });
            }
        }
        await this.esploader.writeFlash(flashOptions);
        await this.esploader.after();
        app.renderer.modal_hide("flashing");
    }

    async flashRead() {
        await this.esploader.readFlash(address, size);
    }

    async renderPageError(error) {
        return [{
            type: "card",
            content: {
                outline: true,
                header: {
                    color: "red",
                    content: [{ type: "title", content: "An error occurred" }],
                    tools: [
                        {
                            type: "link",
                            icon: "link",
                            target: "javascript:window.app.page.disconnect();",
                            button: ["sm"],
                            color: "red",
                            label: "Disconnect"
                        },
                    ]
                },
                content: [
                    {
                        type: "paragraph",
                        content: error
                    },
                ]
            }
        },
        ];
    }

    async renderPageWelcome() {
        if (this.serialLib === null) {
            return [
                {
                    type: "paragraph",
                    content: "Welcome to the web recovery application."
                },
                {
                    type: "paragraph",
                    content: "This application is only compatible with browsers that support the WebUSB or WebSerial API. Unfortunately Firefox does not support these APIs."
                }
            ];
        }
        return [
            {
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "green",
                        content: [{ type: "title", content: "Ready to connect" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.connect();",
                                button: ["sm"],
                                color: "green",
                                label: "Connect"
                            },
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "To get started click the \"connect\" button and select a device."
                        },
                        {
                            type: "paragraph",
                            content: "Tanmatsu will appear as one or two \"USB JTAG/Serial debug unit\" interfaces in the list."
                        },
                        {
                            type: "paragraph",
                            content: "First you want to flash the application processor (ESP32-P4) firmware by selecting the first interface in the list."
                        },
                        {
                            type: "paragraph",
                            content: "Then you can optionally flash the radio module (ESP32-C6) firmware by selecting the second interface in the list after enabling the radio module using the instructions below."
                        },
                        {
                            type: "paragraph",
                            content: "If your Tanmatsu does not show up in the list or refuses to connect first power down the device by holding the power button until the device powers off. Then re-connect it to USB while pressing down the third ('volume down') button on the right side of the device. This will force the application processor into ROM bootloader mode which will always work regardless of the current state of the firmware on the flash chip."
                        },
                    ]
                }
            },
            {
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "orange",
                        content: [{ type: "title", content: "How to enable the radio module" }],
                        tools: [
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "If you want to connect to the ESP32-C6 radio module on a Tanmatsu then please note that the radio module has to be enabled by the application running on the ESP32-P4 application processor."
                        },
                        {
                            type: "paragraph",
                            content: "If you have flashed the launcher firmware then you can force the radio to be enabled and put into bootloader mode by pressing FN + \"orange triangle\" on the keyboard of Tanmatsu while on the home screen of the launcher firmware. The radio LED will turn blue. To start the radio module in application mode press FN + \"yellow square\"."
                        },
                        {
                            type: "paragraph",
                            content: "When the Meshtastic frontend firmware is running the radio is always enabled in application mode. If you have trouble flashing the radio module please try to re-flash the launcher firmware first and then enable the radio module in bootloader using the key combination above."
                        },
                        {
                            type: "paragraph",
                            content: "The ESP32-C6 radio module should show up as a second \"USB JTAG/Serial debug unit\" interface. To connect to the radio module select this second interface after clicking the connect button."
                        },
                    ]
                }
            }
        ];
    }

    async renderPageConnecting() {
        return [
            {
                type: "paragraph",
                content: "Connecting..."
            }
        ];
    }

    async renderPageErasing() {
        return [
            {
                type: "paragraph",
                content: "Please wait, erasing flash memory (this will take a minute)..."
            }
        ];
    }

    async renderPageConnected() {
        let page = [
            {
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "green",
                        content: [{ type: "title", content: "Connected" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.disconnect();",
                                button: ["sm"],
                                color: "secondary",
                                label: "Disconnect"
                            },
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.eraseFlash();",
                                button: ["sm"],
                                color: "red",
                                label: "Erase entire flash chip"
                            },
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "Connected to '" + this.chip + "'"
                        },
                    ]
                }
            },
        ];

        if (this.chip.includes("ESP32-P4")) {
            page.push({
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "orange",
                        content: [{ type: "title", content: "Application processor" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('launcher', false);",
                                button: ["sm"],
                                color: "red",
                                label: "Install launcher (keep filesystem)"
                            },
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('launcher', true);",
                                button: ["sm"],
                                color: "orange",
                                label: "Install launcher"
                            },
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('meshtastic', true);",
                                button: ["sm"],
                                color: "green",
                                label: "Install Meshtastic frontend"
                            },
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "You have successfully connected to the application processor (ESP32-P4) of your Tanmatsu device. You can now flash the launcher firmware or the Meshtastic frontend firmware (preview)."
                        },
                        {
                            type: "paragraph",
                            content: "After flashing the device needs to be restarted. To restart the device first disconnect, then turn off the device by holding down the power button until it powers off. Then turn it back on by pressing the power button again."
                        },
                    ]
                }
            });
        }


        if (this.chip.includes("ESP32-C6")) {
            page.push({
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "green",
                        content: [{ type: "title", content: "Radio coprocessor" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('radio/esphosted', true);",
                                button: ["sm"],
                                color: "orange",
                                label: "Install WiFi/BLE firmware"
                            },
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('radio/meshtastic', true);",
                                button: ["sm"],
                                color: "green",
                                label: "Install Meshtastic radio"
                            },
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "You have successfully connected to the application processor (ESP32-P4) of your Tanmatsu device. You can now flash the launcher firmware or the Meshtastic frontend firmware (preview)."
                        },
                        {
                            type: "paragraph",
                            content: "After flashing the device needs to be restarted. To restart the device first disconnect, then turn off the device by holding down the power button until it powers off. Then turn it back on by pressing the power button again."
                        },
                    ]
                }
            });
        }

        page.push({
            type: "card",
            content: {
                outline: true,
                header: {
                    color: "secondary",
                    content: [{ type: "title", content: "Flash a custom binary file" }],
                    tools: [
                        {
                            type: "link",
                            icon: "link",
                            target: "javascript:window.app.page.flashFile();",
                            button: ["sm"],
                            color: "secondary",
                            label: "Flash"
                        },
                    ]
                },
                content: [
                    {
                        type: "input",
                        content: {
                            type: "file",
                            id: "flash-file",
                            placeholder: "Binary file to flash",
                        }
                    },
                    {
                        type: "input",
                        content: {
                            type: "text",
                            id: "flash-address",
                            placeholder: "Flash address (example: 0x1000)",
                        }
                    }
                ]
            }
        });

        return page;
    }

    async render() {
        let page = [];

        if (this.lastError !== null) {
            page = await this.renderPageError(this.lastError);
            this.lastError = null;
        } else if (this.device === null || this.chip === null) {
            if (this.isConnecting) {
                page = await this.renderPageConnecting();
            } else {
                page = await this.renderPageWelcome();
            }
        } else {
            if (this.isErasing) {
                page = await this.renderPageErasing();
            } else {
                page = await this.renderPageConnected();
            }
        }

        let content = {
            header: {
                title: "Firmware flashing utility",
                breadcrumbs: [
                    {
                        label: ""
                    }
                ]
            },
            content: [[
                {
                    width: 12,
                    content: page
                }
            ]]
        };

        this.app.renderer.render_content(content);
    }

    async showError(error) {
        this.lastError = error;
        this.render();
    }

    async get_instructions(name) {
        const url = "/firmware/" + name + "/instructions.trf"
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        this.instructions = await response.json();
    }

    render_error(e) {
        let content = {
            header: {
                title: "Recovery",
                breadcrumbs: [
                    {
                        label: "Recovery"
                    }
                ]
            },
            content: [[]]
        };

        content.content[0].push({
            width: 12,
            content: {
                type: "callout",
                content: {
                    color: "error",
                    content: [
                        {
                            type: "paragraph",
                            content: "An error occurred"
                        }
                    ]
                }
            }
        });

        this.app.renderer.render_content(content);
    }

    on_badge_connected() {
        if (this.app.page !== this) return;
        this.render();
    }

    on_badge_disconnected() {
        if (this.app.page !== this) return;
        this.render();
    }
}
