/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
/***********************************************
 * BEYOND CLOUD CONSULTING INC. | BCC
/***********************************************
 * TASK         : HANDLE SHIPPING & HANDLING DETAILS
 * TICKET NUMBER: 
 * INSTANCE     : MAGISTER LLC SANDBOX
 * CREATED BY   : JOE THOMSON
 * CREATED DATE : 11/30/2021
 *
 * REVISON HISTORY
 * 
 /***********************************************/
define([
    "N/record",
    "N/email",
    "N/ui/serverWidget"
],
    (record, email, serverWidget) => {
        //NOTE: Include strings of IDs in the SHIP_METHODS array as we use includes() method
        const SHIP_METHODS = ["4", "1111"] // 4: UPS and 1111: FedEx Ground®
        const CHARGEABLE_STATES = ['AL', 'HI']; // AL: Alaska and HI: Hawaii
        const UNCHARGEABLE_COUNTRIES = ['US']; // US: United States
        const DEVELOPER_EMAILS_ARR = [
            'joe@beyondcloudconsulting.com',
        ];
        return {
            /**
             * @description Userevent Entrypoint - beforeLoad
             * @description Hide the shipping cost and handling cost if there are no values corresponding to fields
             * @param {void|object} context | Userevent Context
             * @returns
             */
            beforeLoad: (context) => {
                try {
                    let form = context.form;
                    let newRecord = context.newRecord;
                    let shippingCost = newRecord.getValue({ fieldId: "shippingcost" });
                    let handlingCost = newRecord.getValue({ fieldId: "handlingcost" });

                    if (!shippingCost)
                        form.getField({ id: "altshippingcost" }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
                    if (!handlingCost)
                        form.getField({ id: "althandlingcost" }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
                }
                catch (er) {
                    log.debug('er@beforeLoad', er.message);
                }
            },
            /**
             * @description Userevent Entrypoint - afterSubmit
             * @description Set Shipping Cost and Handling Cost to zero based on rules
             * @param {void|object} context | Userevent Context
             * @returns
             */
            afterSubmit: (context) => {
                try {
                    let newRecordId = context.newRecord.id;
                    let newRecord = record.load({
                        type: record.Type.SALES_ORDER,
                        id: newRecordId
                    });
                    let shipMethod = newRecord.getValue({ fieldId: "shipmethod" });
                    let shipCountry = newRecord.getValue({ fieldId: "shipcountry" });
                    let shipState = newRecord.getValue({ fieldId: "shipstate" });
                    log.debug('Record Details', {
                        "shipMethod": shipMethod,
                        "shipCountry": shipCountry,
                        "shipState": shipState
                    });
                    if (SHIP_METHODS.includes(shipMethod) && UNCHARGEABLE_COUNTRIES.includes(shipCountry) && !CHARGEABLE_STATES.includes(shipState)) {
                        newRecord.setValue({ fieldId: "shippingcost", value: Number(0.00) });
                        newRecord.setValue({ fieldId: "handlingcost", value: Number(0.00) });
                        newRecord.save({ enableSourcing: false, ignoreMandatoryFields: true });
                    }
                } catch (er) {
                    log.debug('er@afterSubmit', er.message);
                    try {
                        email.send({
                            author: -5,
                            recipients: DEVELOPER_EMAILS_ARR,
                            subject: 'Error | Handle Shipping and Handling Details',
                            body: 'Dear user, <br>Please check the error logs.<br>' + er.message + '<br>Thank you',
                        });
                    } catch (er) {
                        log.debug('er@sendEmail', er.message);
                    }
                }
            }
        }
    })