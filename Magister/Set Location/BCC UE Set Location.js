/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
/***********************************************
 * BEYOND CLOUD CONSULTING INC. | BCC
/***********************************************
 * TASK         : HANDLE SHIPPING & HANDLING DETAILS
 * TICKET NUMBER:
 * INSTANCE     : MAGISTER LLC PRODUCTION
 * CREATED BY   : JOE THOMSON
 * CREATED DATE : 12/01/2021
 *
 * REVISON HISTORY
 *
 /***********************************************/
define([
    "N/record",
    "N/search",
    "N/email"
],
    (record, search, email) => {

        const NJ_WAREHOUSE = 1;
        const TX_WAREHOUSE = 2;
        const NJ_WAREHOUSE_STATES = ["CT", "DE", "IL", "IN", "KY", "ME", "MD", "MA", "MI", "NH", "NJ", "NY", "NC", "OH", "PA", "RI", "SC", "TN", "VT", "VA", "WV"];
        const TX_WAREHOUSE_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "FL", "GA", "HI", "ID", "IA", "KS", "LA", "MN", "MS", "MO", "MT", "NE", "NV", "NM", "ND", "OK", "OR", "PR", "SD", "TX", "UT", "WA", "WI", "WY"];
        let CLIENT_WAREHOUSE;

        let fetchItemDetails = (itemsArr) => {
            if (!itemsArr.length) return;
            let itemDetailsObj = {};
            var itemSearchObj = search.create({
                type: "item",
                filters: ["internalid", "anyof", itemsArr],
                columns:
                    [
                        search.createColumn({ name: "internalid", label: "Internal ID" }),
                        search.createColumn({ name: "itemid", sort: search.Sort.ASC, label: "Name" }),
                        search.createColumn({ name: "type", label: "Type" }),
                        search.createColumn({ name: "inventorylocation", label: "Inventory Location" }),
                        search.createColumn({ name: "locationquantityonhand", label: "Location On Hand" }),
                        search.createColumn({ name: "locationquantityavailable", label: "Location Available" })
                    ]
            });
            itemSearchObj.run().each(function (result) {
                let itemId = result.getValue(itemSearchObj.columns[0]);
                let locationId = result.getValue(itemSearchObj.columns[3]);
                let quantityAvailable = result.getValue(itemSearchObj.columns[5]);
                if (!itemDetailsObj[itemId])
                    itemDetailsObj[itemId] = {};
                if (!itemDetailsObj[itemId][locationId]) {
                    itemDetailsObj[itemId][locationId] = Number(quantityAvailable);
                }
                return true;
            });
            return itemDetailsObj;
        }

        return {
            beforeLoad: (context) => {
                try {
                    let form = context.form;
                    let newRecord = context.newRecord;
                    let shipStatus = newRecord.getValue({ fieldId: 'shipstatus' });
                    log.debug('shipStatus', shipStatus);
                    let inlineField = form.addField({ id: 'custpage_test', label: 'Test', type: 'INLINEHTML', });
                    if(shipStatus == 'A')
                        inlineField.defaultValue = "<script>jQuery('#markpacked').prop('value', 'Mark Picked');</script>";
                    else if (shipStatus == 'B')
                        inlineField.defaultValue = "<script>jQuery('#markpacked').prop('value', 'Mark Shipped');</script>";
                } catch (er) {
                    log.debug('er@beforeLoad', er.message);
                }
            },
            afterSubmit: (context) => {
                try {
                    //script works only in CREATE mode
                    if (context.type !== context.UserEventType.CREATE) return;
                    let newRecordId = context.newRecord.id;
                    let soObj = record.load({
                        type: record.Type.SALES_ORDER,
                        id: newRecordId,
                        isDynamic: true
                    });
                    let shipState = soObj.getValue({ fieldId: "shipstate" });
                    log.debug('shipState', shipState);
                    // Note: If client's state is closer to the New Jersey warehouse, set location as New Jersey
                    // If client's state is closer to Texas warehouse, or a state doesn't exist for the client, set location as Texas
                    CLIENT_WAREHOUSE = NJ_WAREHOUSE_STATES.includes(shipState) ? NJ_WAREHOUSE : (TX_WAREHOUSE_STATES.includes(shipState) ? TX_WAREHOUSE : TX_WAREHOUSE);
                    log.debug('CLIENT_WAREHOUSE', CLIENT_WAREHOUSE);
                    let lineCount = soObj.getLineCount({ sublistId: 'item' });
                    log.debug('lineCount', lineCount);
                    if (!lineCount) return;
                    var itemSublistFields = soObj.getSublistFields({ sublistId: 'item' });
                    let itemSublistDetailsObj = {};
                    let itemsArr = [];
                    for (let i = 0; i < lineCount; i++) {
                        let itemSublistFieldValues = itemSublistFields.reduce((accumulator, element, index) => {
                            if (element == 'item') {
                                itemsArr.push(soObj.getSublistValue({
                                    sublistId: 'item',
                                    fieldId: element,
                                    line: i
                                }));
                            }
                            if (!accumulator[element]) {
                                accumulator[element] = soObj.getSublistValue({
                                    sublistId: 'item',
                                    fieldId: element,
                                    line: i
                                });
                            }
                            return accumulator;
                        }, {});
                        itemSublistDetailsObj[i] = itemSublistFieldValues;
                    }

                    let itemDetails = fetchItemDetails(itemsArr);
                    log.debug('itemDetails', itemDetails);

                    for (let lineKey in itemSublistDetailsObj) {

                        let item = itemSublistDetailsObj[lineKey]["item"];
                        let quantity = itemSublistDetailsObj[lineKey]["quantity"];

                        log.debug('item @ ' + lineKey, item);
                        log.debug('quantity @ ' + lineKey, quantity);

                        let totalQuantityAcrossLocations = 0;
                        let status;

                        if (itemDetails[item]) {
                            log.debug('Item quantity in preferred warehouse', Number(itemDetails[item][CLIENT_WAREHOUSE]));
                            // If the preferred location has sufficient quantity
                            if (Number(itemDetails[item][CLIENT_WAREHOUSE]) >= Number(quantity)) {
                                status = 'DO_NOT_SPLIT_LINE';
                                soObj.selectLine({ sublistId: 'item', line: lineKey });
                                soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: CLIENT_WAREHOUSE });
                                soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: Number(quantity) });
                                soObj.commitLine({ sublistId: 'item' });
                                itemDetails[item][CLIENT_WAREHOUSE] = Number(itemDetails[item][CLIENT_WAREHOUSE]) - Number(quantity);
                            }
                            // If the preferred location has insufficient quantity
                            else {

                                for (let key in itemDetails[item]) {
                                    totalQuantityAcrossLocations = Number(totalQuantityAcrossLocations) + Number(itemDetails[item][key]);
                                }
                                log.debug('totalQuantityAcrossLocations', Number(totalQuantityAcrossLocations));
                                // If the quantity across all locations has sufficient quantity to meet the required quantity
                                if (Number(totalQuantityAcrossLocations) >= Number(quantity)) {

                                    status = 'SPLIT_LINE';

                                    soObj.selectLine({ sublistId: 'item', line: lineKey });
                                    soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: CLIENT_WAREHOUSE });
                                    soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: Number(itemDetails[item][CLIENT_WAREHOUSE]) });
                                    soObj.commitLine({ sublistId: 'item' });

                                    let remainingQuantityToOrder1 = Number(quantity) - Number(itemDetails[item][CLIENT_WAREHOUSE]);
                                    log.debug('remainingQuantityToOrder1', remainingQuantityToOrder1);

                                    for (let key in itemDetails[item]) {
                                        if (key != CLIENT_WAREHOUSE) {
                                            if (Number(itemDetails[item][key]) > Number(remainingQuantityToOrder1)) {
                                                soObj.selectNewLine({ sublistId: 'item' });
                                                for (let key in itemSublistDetailsObj[lineKey]) {
                                                    if (key == 'item') {
                                                        soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: key, value: itemSublistDetailsObj[lineKey][key] });
                                                    }
                                                }
                                                soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: key });
                                                soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: Number(remainingQuantityToOrder1) });
                                                soObj.commitLine({ sublistId: 'item' });
                                                itemDetails[item][key] = Number(itemDetails[item][key]) - Number(remainingQuantityToOrder1);
                                                remainingQuantityToOrder1 = 0;
                                            }
                                        }
                                    }
                                    itemDetails[item][CLIENT_WAREHOUSE] = 0;
                                    log.debug('new remainingQuantityToOrder1', remainingQuantityToOrder1);

                                }
                                // If the quantity across all locations has insufficient quantity to meet the required quantity
                                else {

                                    status = 'ASSIGN_TO_BACKORDERED_QUANTITY_IN_PREFERRED_WAREHOUSE';

                                    let remainingQuantityToOrder2 = Number(quantity) - Number(itemDetails[item][CLIENT_WAREHOUSE]);
                                    log.debug('remainingQuantityToOrder2', remainingQuantityToOrder2);

                                    let temp = 0;

                                    for (let key in itemDetails[item]) {
                                        if (key != CLIENT_WAREHOUSE) {
                                            if (Number(remainingQuantityToOrder2) > Number(itemDetails[item][key])) {
                                                temp = Number(remainingQuantityToOrder2) - Number(itemDetails[item][key]);
                                                log.debug('temp', temp);
                                                soObj.selectNewLine({ sublistId: 'item' });
                                                for (let key in itemSublistDetailsObj[lineKey]) {
                                                    if (key == 'item') {
                                                        soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: key, value: itemSublistDetailsObj[lineKey][key] });
                                                    }
                                                }
                                                soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: key });
                                                // soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: Number(temp) });
                                                soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: Number(itemDetails[item][key]) });
                                                soObj.commitLine({ sublistId: 'item' });
                                                remainingQuantityToOrder2 = Number(remainingQuantityToOrder2) - Number(itemDetails[item][key]);
                                                itemDetails[item][key] = 0;
                                            }
                                        }
                                    }

                                    soObj.selectLine({ sublistId: 'item', line: lineKey });
                                    soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: CLIENT_WAREHOUSE });
                                    soObj.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: (Number(itemDetails[item][CLIENT_WAREHOUSE]) + Number(remainingQuantityToOrder2)) });
                                    soObj.commitLine({ sublistId: 'item' });
                                    itemDetails[item][CLIENT_WAREHOUSE] = 0;

                                }
                            }
                        }

                        log.debug('status ' + lineKey, status);
                        log.debug('itemDetails', itemDetails);

                    }

                    let newSOId = soObj.save({ enableSourcing: true, ignoreMandatoryFields: true });
                    log.debug('newSOId', newSOId);

                    try {
                        let salesOrderObj = record.load({
                            type: record.Type.SALES_ORDER,
                            id: newSOId,
                            isDynamic: true
                        });
                        var salesOrderLineCount = salesOrderObj.getLineCount({ sublistId: 'item' });
                        log.debug('salesOrderLineCount', salesOrderLineCount);
                        for (let i = salesOrderLineCount - 1; i >= 0; i--) {
                            let itemQuantity = salesOrderObj.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i });
                            log.debug('itemQuantity', itemQuantity);
                            if (!Number(itemQuantity)) {
                                salesOrderObj.removeLine({ sublistId: 'item', line: i });
                            }
                        }
                        let salesOrderId = salesOrderObj.save({ enableSourcing: true, ignoreMandatoryFields: true });
                        log.debug('salesOrderId', salesOrderId);
                    } catch (er) {
                        log.debug('er@removeNoQuantityLines', er.message);
                    }

                } catch (er) {
                    log.debug('er@afterSubmit', er.message);
                }
            }
        }
    })