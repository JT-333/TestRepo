/**
 *@NApiVersion 2.0
 *@NScriptType ClientScript
 */
/***********************************************
 * BEYOND CLOUD CONSULTING INC. | BCC
/***********************************************
 * TASK         : SHOW ON HAND & AVAILABLE QUANTITY
 * TICKET NUMBER:
 * INSTANCE     : MAGISTER LLC PRODUCTION
 * CREATED BY   : JOE THOMSON
 * CREATED DATE : 12/09/2021
 *
 * REVISON HISTORY
 *
 /***********************************************/
define([
    "N/search"
],
    function (search) {

        const NJ_WAREHOUSE = 1;
        const TX_WAREHOUSE = 2;

        function applyTryCatch(DATA_OBJ, NAME) {
            function tryCatch(myfunction, key) {
                return function () {
                    try {
                        return myfunction.apply(this, arguments);
                    } catch (e) {
                        console.log("error in " + key, e);
                        ERROR_STACK.push(e);
                        return false;
                    }
                };
            }
            for (var key in DATA_OBJ) {
                if (typeof DATA_OBJ[key] === "function") {
                    DATA_OBJ[key] = tryCatch(DATA_OBJ[key], NAME + "." + key);
                }
            }
        }

        var dataSet = {
            iterateSavedSearch: function (searchObj) {
                try {
                    var response = [];
                    var searchPageRanges;
                    try {
                        searchPageRanges = searchObj.runPaged({ pageSize: 1000 });
                    } catch (er) {
                        console.log('er@runPaged', er.message);
                        return [];
                    }
                    if (searchPageRanges.pageRanges.length < 1) return [];
                    var pageRangeLength = searchPageRanges.pageRanges.length;
                    for (var pageIndex = 0; pageIndex < pageRangeLength; pageIndex++) {
                        searchPageRanges.fetch({ index: pageIndex }).data.forEach(function (result) { response.push(result); });
                    }
                    return response;
                } catch (er) {
                    console.log('error@iterateSavedSearch', er.message);
                }
            },
            fetchItemDetails: function (item) {
                try {
                    if (!item) return {};
                    var itemDetailsObj = {};
                    var itemSearchObj = search.create({
                        type: search.Type.ITEM,
                        filters: ["internalid", "anyof", item],
                        columns:
                            [
                                search.createColumn({ name: "internalid", label: "Internal ID" }),
                                search.createColumn({ name: "inventorylocation", label: "Inventory Location" }),
                                search.createColumn({ name: "locationquantityonhand", label: "Location On Hand" }),
                                search.createColumn({ name: "locationquantityavailable", label: "Location Available" })
                            ]
                    });
                    dataSet.iterateSavedSearch(itemSearchObj).forEach(function (result) {
                        var itemId = result.getValue(itemSearchObj.columns[0]);
                        var locationId = result.getValue(itemSearchObj.columns[1]);
                        var quantityOnHand = result.getValue(itemSearchObj.columns[2]);
                        var quantityAvailable = result.getValue(itemSearchObj.columns[3]);
                        if (!itemDetailsObj[itemId]) itemDetailsObj[itemId] = {};
                        if (!itemDetailsObj[itemId][locationId]) {
                            itemDetailsObj[itemId][locationId] = { 'quantity_onhand': '', 'quantity_available': '' };
                            if (!itemDetailsObj[itemId][locationId]['quantity_onhand'])
                                itemDetailsObj[itemId][locationId]['quantity_onhand'] = Number(quantityOnHand);
                            if (!itemDetailsObj[itemId][locationId]['quantity_available'])
                                itemDetailsObj[itemId][locationId]['quantity_available'] = Number(quantityAvailable);
                        }
                        return true;
                    });
                    return Object.keys(itemDetailsObj).length ? itemDetailsObj : {};
                } catch (er) {
                    console.log('er@fetchItemDetails', er.message);
                    return {};
                }
            }
        }
        applyTryCatch(dataSet, 'dataSet');

        return {
            fieldChanged: function (context) {
                try {
                    var currentRecord = context.currentRecord;
                    if (context.fieldId == 'item') {
                        var item = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                        console.log('Item: ', item);
                        if (item) {
                            var itemDetailsObj = dataSet.fetchItemDetails(item);
                            console.log('Item Details: ', itemDetailsObj);
                            if (itemDetailsObj[item]) {
                                currentRecord.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'custcol_nj_onhand',
                                    value: itemDetailsObj[item][NJ_WAREHOUSE]['quantity_onhand'],
                                });
                                currentRecord.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'custcol_tx_onhand',
                                    value: itemDetailsObj[item][TX_WAREHOUSE]['quantity_onhand']
                                });
                                currentRecord.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'custcol_nj_available',
                                    value: itemDetailsObj[item][NJ_WAREHOUSE]['quantity_available'],
                                });
                                currentRecord.setCurrentSublistValue({
                                    sublistId: 'item',
                                    fieldId: 'custcol_tx_available',
                                    value: itemDetailsObj[item][TX_WAREHOUSE]['quantity_available'],
                                });
                            }
                        }
                    }
                } catch (er) {
                    console.log('er@fieldChanged', er.message);
                }
            }
        }
    })