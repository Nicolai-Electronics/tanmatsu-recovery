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
        this.serialLib = (typeof navigator.serial !== "undefined") ? navigator.serial : null;
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
                            content: "Then you can optionally flash the radio module (ESP32-C6) firmware by selecting the second interface in the list after enabling the radio module. See the 'Information' page for instructions on how to enable the radio module."
                        }
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
                            }
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "Connected to " + (this.chip.includes("ESP32-P4") ? "the ESP32-P4 application processor" : this.chip.includes("ESP32-C6") ? "the ESP32-C6 radio module" : "an unknown device (" + this.chip + ")") + "."
                        },
                        {
                            type: "paragraph",
                            content: "To disconnect from the device and return to the start page of this application press the 'Disconnect' button on the top right. Other options are displayed in the sections below."
                        },
                        {
                            type: "paragraph",
                            content: "Note that even after disconnecting the device will stay in the bootloader mode. To start the newly installed firmware the device needs to be restarted. To restart the device first disconnect the USB cable, then turn off the device by holding down the power button until it powers off. Then turn it back on by pressing the power button again."
                        },
                    ]
                }
            },
        ];

    page.push({
            type: "card",
            content: {
                outline: true,
                header: {
                    color: "red",
                    content: [{ type: "title", content: "Flash erase" }],
                    tools: [
                        {
                            type: "link",
                            icon: "link",
                            target: "javascript:window.app.page.eraseFlash();",
                            button: ["sm"],
                            color: "red",
                            label: "Erase entire flash chip"
                        }
                    ]
                },
                content: [
                    {
                        type: "paragraph",
                        content: "Erasing the flash chip is an optional step. By erasing the flash you ensure that your Tanmatsu starts from a blank slate. After erasing the flash you will need to flash the launcher firmware in order to use the device."
                    }
                ]
            }
        });

        if (this.chip.includes("ESP32-P4")) {
            page.push({
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "orange",
                        content: [{ type: "title", content: "Launcher firmware" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('launcher', true);",
                                button: ["sm"],
                                color: "orange",
                                label: "Full install"
                            }
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "To reinstall the launcher firmware simply press the 'install' button. Note that this will delete all files from the filesystem of your device in order to reinstall the icon files."
                        },
                        {
                            type: "paragraph",
                            content: ""
                        },
                    ]
                }
            });

            page.push({
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "green",
                        content: [{ type: "title", content: "Meshtastic preview" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('meshtastic', true);",
                                button: ["sm"],
                                color: "secondary",
                                label: "Install Meshtastic frontend"
                            },
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "As an alternative to the Tanmatsu launcher you can install the Meshtastic frontend firmware (preview) firmware. Note that you will also need to install Meshtastic to the ESP32-C6 radio module. It is recommended to first flash the radio module to Meshtastic before flashing the frontend firmware. To access the radio after you have flashed the frontend firmware simply restart the device and then connect to the second debug interface."
                        }
                    ]
                }
            });

            page.push({
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "secondary",
                        content: [{ type: "title", content: "Legacy v0.0.12 launcher firmware" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('launcher-v0-0-12', false);",
                                button: ["sm"],
                                color: "secondary",
                                label: "Install without FAT filesystem"
                            },
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('launcher-v0-0-12', true);",
                                button: ["sm"],
                                color: "secondary",
                                label: "Full install"
                            }
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "To reinstall the legacy v0.0.12 launcher firmware simply press the 'install' button. Note that this will delete all files from the filesystem of your device in order to reinstall the icon files."
                        },
                        {
                            type: "paragraph",
                            content: ""
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
                        color: "orange",
                        content: [{ type: "title", content: "Tanmatsu radio firmware" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('radio/esphosted', true);",
                                button: ["sm"],
                                color: "orange",
                                label: "Install"
                            }
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "To reinstall the radio firmware simply press the 'install' button."
                        }
                    ]
                }
            });

            page.push({
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "green",
                        content: [{ type: "title", content: "Meshtastic preview" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('radio/meshtastic', true);",
                                button: ["sm"],
                                color: "secondary",
                                label: "Install Meshtastic radio"
                            },
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "As an alternative to the Tanmatsu launcher and its radio firmware you can install the Meshtastic radio firmware. Note that this also needs the Meshtastic frontend firmware to be installed on the flash of the ESP32-P4 application processor."
                        },
                    ]
                }
            });

            page.push({
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "secondary",
                        content: [{ type: "title", content: "Tanmatsu radio firmware (legacy v0.0.12)" }],
                        tools: [
                            {
                                type: "link",
                                icon: "link",
                                target: "javascript:window.app.page.flashFirmware('radio/esphosted-v0-0-12', true);",
                                button: ["sm"],
                                color: "secondary",
                                label: "Install"
                            }
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "To reinstall the legacy v0.0.12 radio firmware simply press the 'install' button."
                        }
                    ]
                }
            });
        }

        /*page.push({
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
        });*/

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
