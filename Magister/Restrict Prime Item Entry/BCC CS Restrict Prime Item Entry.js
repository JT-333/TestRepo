/**
 *@NApiVersion 2.0
 *@NScriptType ClientScript
 */
/***********************************************
 * BEYOND CLOUD CONSULTING INC. | BCC
/***********************************************
 * TASK         : RESTRICT PRIME ITEM ENTRY
 * TICKET NUMBER:
 * INSTANCE     : MAGISTER LLC PRODUCTION
 * CREATED BY   : JOE THOMSON
 * CREATED DATE : 12/23/2021
 *
 * REVISON HISTORY
 *
 /***********************************************/
define([
    "N/search",
    "N/runtime"
],
    function (search, runtime) {

        const ADMINISTRATOR = "administrator";

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
                                search.createColumn({ name: "itemid", label: "Name" }),
                            ]
                    });
                    dataSet.iterateSavedSearch(itemSearchObj).forEach(function (result) {
                        var itemId = result.getValue(itemSearchObj.columns[0]);
                        var itemName = result.getValue(itemSearchObj.columns[1]);
                        if (!itemDetailsObj[itemId]) itemDetailsObj[itemId] = { '_internal_id': '', '_item_name': '' };
                        itemDetailsObj[itemId]['_internal_id'] = itemId;
                        itemDetailsObj[itemId]['_item_name'] = itemName;
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
                        var roleId = runtime.getCurrentUser().roleId;
                        if (roleId != ADMINISTRATOR) {
                            var item = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                            console.log('Item: ', item);
                            if (item) {
                                var itemDetailsObj = dataSet.fetchItemDetails(item);
                                console.log('Item Details: ', itemDetailsObj);
                                if (itemDetailsObj[item]) {
                                    var itemName = itemDetailsObj[item]['_item_name'] ? itemDetailsObj[item]['_item_name'] : '';
                                    itemName = itemName.toString();
                                    if (itemName) {
                                        if (itemName.endsWith(' Prime') || itemName.endsWith(' prime')) {
                                            alert('Sorry, you are restricted from entering prime items.\nPlease contact your administrator.');
                                            currentRecord.setCurrentSublistValue({
                                                sublistId: 'item',
                                                fieldId: 'item',
                                                value: '',
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (er) {
                    console.log('er@fieldChanged', er.message);
                }
            }
        }
    })