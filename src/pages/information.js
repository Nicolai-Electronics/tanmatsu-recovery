"use strict";

export class Information {
    constructor(app) {
        this.app = app;
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

    async renderPageWelcome() {
        return [
            {
                type: "card",
                content: {
                    outline: true,
                    header: {
                        color: "orange",
                        content: [{ type: "title", content: "Introduction & how to reinstall the ESP32-P4 firmware" }],
                        tools: []
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "Welcome! This application gives you all the tools you need for managing and restoring the firmware of your Tanmatsu even if the device does not currently contain valid firmware."
                        },
                        {
                            type: "paragraph",
                            content: "Your Tanmatsu contains two ESP32 microcontrollers. The first is an ESP32-P4, which is used as the application processor and the second is an ESP32-C6 which is used as the radio. If the ESP32-P4 application processor does not contain working firmware then the screen of your Tanmatsu stays empty after powering on. Normally you should be able to connect to the ESP32-P4 using esptool.py or this website by connecting to the first or only \"USB JTAG/Serial debug unit\" that appears in the list when clicking the green 'Connect' button on the 'Recovery' page. In case this does not work it might help to force the ESP32-P4 into bootloader mode. This can be done by holding down the 'volume down' key on the right side of your Tanmatsu. It is the third button from the top next to the QWIIC port."
                        },
                        {
                            type: "image",
                            content: "/images/side.png"
                        },
                        {
                            type: "paragraph",
                            content: "After you have started the device in bootloader mode switch to the 'Recovery' tab in the menu on the left and click the 'Connect' button. Then select the first \"USB JTAG/Serial debug unit\" that appears in the list."
                        },
                        {
                            type: "image",
                            content: "/images/devices.png"
                        },
                        {
                            type: "paragraph",
                            content: ""
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
                        content: [{ type: "title", content: "How to connect to the ESP32-C6 radio module" }],
                        tools: [
                        ]
                    },
                    content: [
                        {
                            type: "paragraph",
                            content: "If you want to connect to the ESP32-C6 radio module on a Tanmatsu then please note that the radio module has to be enabled by the application running on the ESP32-P4 application processor. Install a functional firmware that enables the radio module on the ESP32-P4 application processor first if you have not yet done so."
                        },
                        {
                            type: "image",
                            content: "/images/side_radio.png"
                        },
                        {
                            type: "paragraph",
                            content: "If you have flashed the launcher firmware then you can force the radio to be enabled and put into bootloader mode by pressing and holding the 'volume up' button on your Tanmatsu while powering on the device."
                        },
                        {
                            type: "paragraph",
                            content: "If the Meshtastic frontend firmware is running the radio is always enabled in application mode. If you have trouble flashing the radio module please try to re-flash the launcher firmware first and then enable the radio module in bootloader using the key combination above."
                        },
                        {
                            type: "paragraph",
                            content: "The ESP32-C6 radio module should show up as a second \"USB JTAG/Serial debug unit\" interface. To connect to the radio module select this second interface after clicking the connect button."
                        },
                        {
                            type: "image",
                            content: "/images/devices_radio.png"
                        },
                        {
                            type: "paragraph",
                            content: ""
                        },
                    ]
                }
            }
        ];
    }

    async render() {
        let page = await this.renderPageWelcome();
        let content = {
            header: {
                title: "Welcome to the Tanmatsu recovery application",
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
}
