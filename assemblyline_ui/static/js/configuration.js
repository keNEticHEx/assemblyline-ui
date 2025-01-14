/* global angular */
'use strict';

/**
 * Main App Module
 */
let app = angular.module('app', ['search', 'utils', 'ui.bootstrap'])
    .controller('ALController', function ($scope, $http) {
        //Parameters vars
        $scope.constants = null;
        $scope.configuration = null;
        $scope.user = null;
        $scope.loading = false;
        $scope.loading_extra = false;

        //DEBUG MODE
        $scope.debug = false;
        $scope.showParams = function () {
            console.log("Scope", $scope)
        };

        //Error handling
        $scope.error = '';
        $scope.success = '';

        $scope.typeOf = function (val) {
            return typeof val;
        };

        $scope.isArrayOfArray = function (val) {
            if (Array.isArray(val)){
                if (Array.isArray(val[0])){
                    return true;
                }
            }
            return false;
        };

        //Load params from datastore
        $scope.start = function () {
            $scope.load_data();
        };

        //Pager methods
        $scope.load_data = function () {
            $scope.loading_extra = true;

            $http({
                method: 'GET',
                url: "/api/v4/help/configuration/"
            })
                .success(function (data) {
                    $scope.loading_extra = false;
                    $scope.configuration = data.api_response;
                })
                .error(function (data, status, headers, config) {
                    $scope.loading_extra = false;

                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    }
                    else {
                        $scope.error = config.url + " (" + status + ")";
                    }
                    $scope.started = true;

                });

            $http({
                method: 'GET',
                url: "/api/v4/help/constants/"
            })
                .success(function (data) {
                    $scope.constants = data.api_response;
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    }
                    else {
                        $scope.error = config.url + " (" + status + ")";
                    }
                });
        };
    });
