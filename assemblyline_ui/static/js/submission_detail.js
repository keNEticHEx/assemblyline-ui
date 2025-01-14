/* global angular */
'use strict';

/**
 * Main App Module
 */
let app = angular.module('app', ['utils', 'search', 'ngAnimate', 'socket-io', 'ui.bootstrap', 'ng.jsoneditor'])
    .factory('mySocket', function (socketFactory) {
        let mySocket = socketFactory({namespace: "/live_submission"});
        mySocket.forward('error');
        mySocket.forward('start');
        mySocket.forward('stop');
        mySocket.forward('cachekey');
        mySocket.forward('cachekeyerr');
        return mySocket;
    })
    .controller('ALController', function ($scope, $http, $window, $location, $timeout, $filter, mySocket) {
        //Parameters vars
        $scope.user = null;
        $scope.options = null;
        $scope.configuration = null;
        $scope.loading = false;
        $scope.loading_extra = false;
        $scope.data = null;
        $scope.temp_data = null;
        $scope.sid = null;
        $scope.wq = null;
        $scope.summary = null;
        $scope.attack_matrix = null;
        $scope.attack_map = null;
        $scope.heuristics = null;
        $scope.file_tree = null;
        $scope.tag_map = null;
        $scope.messages = [];
        $scope.messages_error = [];
        $scope.temp_res = Object();
        $scope.temp_errors = Object();
        $scope.file_res = Object();
        $scope.file_errors = Object();
        $scope.file_highlight = null;
        $scope.selected_highlight = [];
        $scope.splitter = "__";
        $scope.showslider = false;
        $scope.current_file = null;
        $scope.backto = 0;
        $scope.final_timeout_count = 0;
        $scope.completed = false;
        $scope.started = false;
        $scope.slide_done = false;
        $scope.redraw_rate = 3000;
        $scope.run_count = 0;
        $scope.num_files = 0;
        $scope.temp_keys = {error: [], result: []};
        $scope.outstanding = null;
        $scope.max_classification = null;
        $scope.filtered = false;
        $scope.partial = false;

        //DEBUG MODE
        $scope.debug = false;
        $scope.showParams = function () {
            console.log("Scope", $scope)
        };

        //Filters
        let tagTypes = [];
        $scope.tagTypeList = function (myTagList) {
            tagTypes = [];
            if (myTagList === undefined || myTagList == null) return [];
            return myTagList;
        };

        $scope.filterTagType = function (tag) {
            let isNewType = tagTypes.indexOf(tag.type) === -1;
            if (isNewType) {
                tagTypes.push(tag.type);
            }
            return isNewType;
        };

        $scope.concatTags = function (res){
            let tag_list = [];
            res.result.sections.forEach(function(section){
                tag_list = tag_list.concat(section.tags);

                if (section.heuristic !== undefined && section.heuristic !== null){
                    if (section.heuristic.attack !== undefined && section.heuristic.attack.length !== 0){
                        for (let x in section.heuristic.attack){
                            let attack = section.heuristic.attack[x];
                            tag_list.push({type: 'attack_pattern', value: attack.attack_id})
                        }
                    }
                    if (section.heuristic.heur_id !== undefined && section.heuristic.heur_id !== null){
                        tag_list.push({type: 'heuristic', value: section.heuristic.heur_id})
                    }
                    if (section.heuristic.signature !== undefined && section.heuristic.signature.length !== 0){
                        for (let x in section.heuristic.signature) {
                            let signature = section.heuristic.signature[x];
                            tag_list.push({type: 'heuristic.signature', value: signature.name})
                        }
                    }
                }
            });
            return tag_list;
        };

        $scope.sectionTags = function (section){
            let tag_list = [];
            tag_list = tag_list.concat(section.tags);

            if (section.heuristic !== undefined && section.heuristic !== null){
                if (section.heuristic.attack !== undefined && section.heuristic.attack.length !== 0){
                    for (let x in section.heuristic.attack){
                        let attack = section.heuristic.attack[x];
                        tag_list.push({type: 'attack_pattern', value: attack.attack_id})
                    }
                }
                if (section.heuristic.heur_id !== undefined && section.heuristic.heur_id !== null){
                    tag_list.push({type: 'heuristic', value: section.heuristic.heur_id})
                }
                if (section.heuristic.signature !== undefined && section.heuristic.signature.length !== 0){
                    for (let x in section.heuristic.signature) {
                        let signature = section.heuristic.signature[x];
                        tag_list.push({type: 'heuristic.signature', value: signature.name})
                    }
                }
            }
            return tag_list;
        };

        $scope.useless_results = function () {
            return function (item) {
                return !(item.result.score === 0 && item.result.sections.length === 0 && item.response.extracted.length === 0);

            }
        };

        $scope.good_results = function () {
            return function (item) {
                return item.result.score === 0 && item.result.sections.length === 0 && item.response.extracted.length === 0;

            }
        };

        $scope.futile_errors = function (error_list) {
            let out = {MAX_DEPTH_REACHED: [], MAX_FILES_REACHED: [], MAX_RETRY_REACHED: [], SERVICE_DOWN: [], SERVICE_BUSY: []};
            for (let idx in error_list) {
                let key = error_list[idx];
                let e_id = key.substr(65, key.length);
                let srv = key.substr(65, key.length);

                if (srv.indexOf(".") !== -1) {
                    srv = srv.substr(0, srv.indexOf("."));
                }
                if (e_id.indexOf(".e") !== -1) {
                    e_id = e_id.substr(e_id.indexOf(".e") + 2, e_id.length);
                }

                if (e_id === "20") {
                    if (out["SERVICE_BUSY"].indexOf(srv) === -1) {
                        out["SERVICE_BUSY"].push(srv);
                    }
                } if (e_id === "21") {
                    if (out["SERVICE_DOWN"].indexOf(srv) === -1) {
                        out["SERVICE_DOWN"].push(srv);
                    }
                } else if (e_id === "12") {
                    if (out["MAX_RETRY_REACHED"].indexOf(srv) === -1) {
                        out["MAX_RETRY_REACHED"].push(srv);
                    }
                } else if (e_id === "10") {
                    if (out["MAX_DEPTH_REACHED"].indexOf(srv) === -1) {
                        out["MAX_DEPTH_REACHED"].push(srv);
                    }
                } else if (e_id === "11") {
                    if (out["MAX_FILES_REACHED"].indexOf(srv) === -1) {
                        out["MAX_FILES_REACHED"].push(srv);
                    }
                }

            }

            out.SERVICE_BUSY.sort();
            out.SERVICE_DOWN.sort();
            out.MAX_DEPTH_REACHED.sort();
            out.MAX_FILES_REACHED.sort();
            out.MAX_RETRY_REACHED.sort();

            return out;
        };

        $scope.relevant_errors = function (error_list) {
            let out = [];
            for (let idx in error_list) {
                let key = error_list[idx];
                let e_id = key.substr(65, key.length);

                if (e_id.indexOf(".e") !== -1) {
                    e_id = e_id.substr(e_id.indexOf(".e") + 2, e_id.length);
                }

                if (["20", "21", "12", "10", "11"].indexOf(e_id) === -1 ) {
                    out.push(key);
                }
            }

            return out;
        };

        $scope.sort_by_name = function (item) {
            return item.response.service_name;
        };

        $scope.obj_len = function (o) {
            if (o === undefined || o == null) return 0;
            return Object.keys(o).length;
        };

        $scope.empty = function (obj) {
            if (obj === null || obj === undefined) {
                return true;
            }
            return Object.keys(obj).length === 0;
        };

        //Action
        $scope.uri_encode = function (val) {
            return encodeURIComponent(val)
        };

        $scope.search_tag = function (tag, value) {
            window.location = '/search.html?query=result.sections.tags.' + tag + ':"' + encodeURIComponent(value) + '"'
        };

        $scope.dump = function (obj) {
            return angular.toJson(obj, true);
        };

        $scope.send_malicious_verdict = function (collection_id){
            $scope.send_verdict(collection_id, 'malicious');
        };

        $scope.send_non_malicious_verdict = function (collection_id){
            $scope.send_verdict(collection_id, 'non_malicious');
        };

        $scope.send_verdict = function (collection_id, verdict) {
            if ($scope.data.verdict[verdict].indexOf($scope.user.uname) !== -1 || $scope.loading_extra){
                return
            }

            $scope.loading_extra = true;
            $http({
                method: 'PUT',
                url: "/api/v4/submission/verdict/" + collection_id + "/" + verdict + "/"
            })
                .success(function (data) {
                    $scope.loading_extra = false;
                    if (!data.api_response.success){
                        return
                    }
                    if (verdict === "malicious"){
                        if ($scope.data.verdict.malicious.indexOf($scope.user.uname) === -1){
                            $scope.data.verdict.malicious.push($scope.user.uname)
                        }
                        if ($scope.data.verdict.non_malicious.indexOf($scope.user.uname) !== -1){
                            $scope.data.verdict.non_malicious.splice($scope.data.verdict.non_malicious.indexOf($scope.user.uname), 1)
                        }
                    }
                    else{
                        if ($scope.data.verdict.non_malicious.indexOf($scope.user.uname) === -1){
                            $scope.data.verdict.non_malicious.push($scope.user.uname)
                        }
                        if ($scope.data.verdict.malicious.indexOf($scope.user.uname) !== -1){
                            $scope.data.verdict.malicious.splice($scope.data.verdict.malicious.indexOf($scope.user.uname), 1)
                        }
                    }
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

                    $scope.loading_extra = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }
                });
        };

        $scope.delete_submission = function () {
            swal({
                    title: "Delete submission?",
                    text: "You are about to delete submission the current submission. This will delete all associated files and results.",
                    type: "warning",
                    showCancelButton: true,
                    confirmButtonColor: "#d9534f",
                    confirmButtonText: "Yes, delete it!",
                    closeOnConfirm: false
                },
                function () {
                    $("div.sweet-alert").find("button").hide();
                    swal({
                        title: "Deleting",
                        text: "Removing all related content...",
                        type: "warning"
                    });
                    $http({
                        method: 'DELETE',
                        url: "/api/v4/submission/" + $scope.sid + "/"
                    })
                        .success(function () {
                            swal("Deleted!", "Submission was succesfully deleted.", "success");
                            $timeout(function () {
                                $window.location = "/submissions.html";
                            }, 1500);
                        })
                        .error(function (data, status, headers, config) {
                            if (status === 401){
                                window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                                return;
                            }

                            if (data === "" || data === null) {
                                return;
                            }

                            let message = "";
                            $scope.loading_extra = false;
                            if (data.api_error_message) {
                                message = data.api_error_message;
                            } else {
                                message = config.url + " (" + status + ")";
                            }
                            $("div.sweet-alert").find("button").show();
                            swal({
                                title: "Deletion failed!",
                                text: message,
                                type: "error",
                                showCancelButton: false,
                                confirmButtonColor: "#D0D0D0",
                                confirmButtonText: "Close",
                                closeOnConfirm: true
                            });
                        });
                });
        };

        $scope.share_submission = function () {
            swal("Share submission", "Sharing function not implemented just yet...", "info");
        };

        $scope.resubmit_dynamic_async = function (sha256, sid, name) {
            $scope.error = '';
            $scope.success = '';
            $scope.loading_extra = true;

            let data = {'name': name, 'copy_sid': sid};

            $http({
                method: 'GET',
                url: "/api/v4/submit/dynamic/" + sha256 + "/",
                params: data
            })
                .success(function (data) {
                    $scope.loading_extra = true;
                    $scope.success = 'File successfully resubmitted for dynamic analysis. You will be redirected...';
                    $timeout(function () {
                        $scope.success = "";
                        window.location = "/submission_detail.html?sid=" + data.api_response.sid;
                    }, 2000);
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    $scope.loading_extra = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        $scope.resubmit_submission = function () {
            $scope.error = '';
            $scope.success = '';
            $scope.loading_extra = true;

            $http({
                method: 'GET',
                url: "/api/v4/submit/resubmit/" + $scope.sid + "/"
            })
                .success(function (data) {
                    $scope.loading_extra = true;
                    $scope.success = 'Current submission successfully resubmitted for analysis. You will be redirected...';
                    $timeout(function () {
                        $scope.success = "";
                        window.location = "/submission_detail.html?sid=" + data.api_response.sid;
                    }, 2000);
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    $scope.loading_extra = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        $scope.timed_redraw = function () {
            $scope.fetch_keys();
            if (!$scope.completed) {
                $timeout(function () {
                    $scope.timed_redraw()
                }, $scope.redraw_rate);
            }
        };

        //SocketIO
        $scope.$on('socket:error', function (event, data) {
            console.log(event.name, "Dispatcher did not respond in a timely manner creating a new watch queue...");
            $scope.setup_watch_queue(true);
        });

        $scope.$on('socket:start', function (event) {
            console.log(event.name);
            $scope.started = true;
            for (let idx in $scope.messages) {
                if ($scope.messages[idx] === "start") {
                    return;
                }
            }
            $scope.messages.push("start");
            sessionStorage.setItem("msg_" + $scope.sid, JSON.stringify($scope.messages));

            if ($scope.temp_data != null) {
                $scope.draw_temp_data();
            }
            $scope.timed_redraw();
        });

        $scope.$on('socket:stop', function (event) {
            console.log(event.name);
            let should_push = true;
            for (let idx in $scope.messages) {
                if ($scope.messages[idx] === "stop") {
                    if (idx < 1) {
                        should_push = false;
                    }
                }
            }
            if (should_push && $scope.messages.length !== 0) {
                $scope.messages.push("stop");
                sessionStorage.setItem("msg_" + $scope.sid, JSON.stringify($scope.messages))
            }

            //That timeout is an ugly fix for an eventually consistent issues with the search index
            //generating the file scores.
            //
            //We should find a better way to fix this!
            $timeout(function () {
                $scope.get_final_data();
            }, 2000);

        });

        $scope.$on('socket:cachekey', function (event, data) {
            //console.log(event.name, data);
            for (let idx in $scope.messages) {
                if ($scope.messages[idx] === data.msg) {
                    return;
                }
            }

            $scope.messages.push(data.msg);
            sessionStorage.setItem("msg_" + $scope.sid, JSON.stringify($scope.messages));

            $scope.temp_keys.result.push(data.msg)
        });

        $scope.$on('socket:cachekeyerr', function (event, data) {
            //console.log(event.name, data);
            for (let idx in $scope.messages_error) {
                if ($scope.messages_error[idx] === data.msg) {
                    return;
                }
            }
            $scope.messages_error.push(data.msg);
            sessionStorage.setItem("error_" + $scope.sid, JSON.stringify($scope.messages_error));

            $scope.temp_keys.error.push(data.msg)
        });

        //Slider functions
        $scope.$watch('showslider', function () {
            if ($scope.showslider) {
                $scope.backto = $window.scrollY;
                $('body').addClass('modal-open');
            } else {
                $('body').removeClass('modal-open');
                $window.scrollTo(0, $scope.backto);
            }
        }, true);

        angular.element($window).on('keydown', function (e) {
            if (e.which === 27 && $scope.showslider) {
                $window.history.back();
            }
        });

        $scope.hide_slider = function () {
            $window.history.back();
        };

        $scope.$on("$locationChangeStart", function (event, next, current) {
            if (current.indexOf(next) === 0 && current !== next) {
                $scope.showslider = false;
            } else if (next.indexOf("#/") !== -1 && next.indexOf("submission_detail.html") !== -1) {
                let idx = next.indexOf("#/");
                if (idx !== -1) {
                    let route = next.slice(idx + 2);
                    let sep_idx = route.indexOf("/");
                    if (sep_idx !== -1) {
                        let sha256 = route.slice(0, sep_idx);
                        let name = decodeURIComponent(route.slice(sep_idx + 1));
                        $scope.view_file_details(sha256, name);
                    }
                }
            }
        });

        //Highlighter
        $scope.trigger_highlight = function (tag, value) {
            let key = tag + $scope.splitter + value;
            let idx = $scope.selected_highlight.indexOf(key);
            if (idx === -1) {
                $scope.selected_highlight.push(key);
            } else {
                $scope.selected_highlight.splice(idx, 1);
            }
            $scope.file_highlight = [];
            for (let item in $scope.selected_highlight) {
                $scope.file_highlight.push.apply($scope.file_highlight, $scope.tag_map[$scope.selected_highlight[item]])
            }
        };

        $scope.remove_highlight = function (key) {
            let values = key.split($scope.splitter, 2);
            $scope.trigger_highlight(values[0], values[1])
        };

        $scope.isHighlighted = function (tag, value) {
            return $scope.selected_highlight.indexOf(tag + $scope.splitter + value) !== -1
        };

        $scope.hasHighlightedTags = function (tags) {
            for (let i in tags) {
                let tag = tags[i];
                if ($scope.isHighlighted(tag.type, tag.value)) {
                    return true;
                }
            }
            return false;
        };

        $scope.clear_selection = function () {
            $scope.selected_highlight = [];
            $scope.file_highlight = null;
        };


        $scope.fetch_keys = function () {
            let data = $scope.temp_keys;
            if (data.error.length === 0 && data.result.length === 0) {
                $scope.run_count += 1;
                if ($scope.run_count % 5 === 0) {
                    $http({
                        method: 'GET',
                        url: "/api/v4/live/outstanding_services/" + $scope.sid + "/"
                    })
                        .success(function (data) {
                            if (Object.keys(data.api_response).length === 0){
                                $scope.error = "We are not receiving any messages from dispatcher and there are no outstanding service. Dispatcher does not seem to be working correctly.";
                                $scope.outstanding = null;
                            }
                            else{
                                $scope.outstanding = data.api_response;
                            }
                        })
                        .error(function (data, status, headers, config) {
                            if (status === 401){
                                window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                                return;
                            }

                            if (data === "" || data === null) {
                                return;
                            }

                            $scope.loading = false;
                            if (data.api_error_message) {
                                $scope.error = data.api_error_message;
                            } else {
                                $scope.error = config.url + " (" + status + ")";
                            }

                        });
                }
                return;
            }
            $timeout(function () {
                $scope.outstanding = null;
            }, 3000);
            $scope.run_count = 0;
            $scope.temp_keys = {error: [], result: []};

            $http({
                method: 'POST',
                url: "/api/v4/result/multiple_keys/",
                data: data
            })
                .success(function (data) {
                    if (!$scope.completed) {
                        $scope.temp_res = data.api_response.result;
                        $scope.temp_errors = data.api_response.error;

                        $scope.draw_results();
                    }
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    $scope.loading = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        //Cache key functions
        $scope.get_cache_key = function (key) {
            $http({
                method: 'GET',
                url: "/api/v4/result/" + key + "/"
            })
                .success(function (data) {
                    if (!$scope.completed) {
                        $scope.temp_res[key] = data.api_response;
                    }
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    $scope.loading = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        $scope.get_cache_key_error = function (key) {
            $http({
                method: 'GET',
                url: "/api/v4/service/error/" + key + "/"
            })
                .success(function (data) {
                    if (!$scope.completed) {
                        $scope.temp_errors[key] = data.api_response;
                    }
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    $scope.loading = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };
        //Error handling
        $scope.error = '';

        $scope.$on('slide', function () {
            $scope.showslider = true;
            $timeout(function () {
                $scope.slide_done = true;
            }, 500);
        });

        $scope.render_file = function (data, name) {
            if ($scope.slide_done) {
                data.api_response['name'] = name;
                $scope.current_file = data.api_response;
                $scope.loading_extra = false;
                $scope.slide_done = false;
            } else {
                $timeout(function () {
                    $scope.render_file(data, name);
                }, 20)
            }

        };

        $scope.view_file_details = function (sha256, name) {
            let method = 'GET';
            let data = null;
            if ($scope.file_res[sha256] !== undefined) {
                if (data == null) {
                    data = {};
                }
                data.extra_result_keys = $scope.file_res[sha256];
            }
            if ($scope.file_errors[sha256] !== undefined) {
                if (data == null) {
                    data = {};
                }
                data.extra_error_keys = $scope.file_errors[sha256];
            }

            if (data != null) {
                method = 'POST';
            }

            $scope.current_file = null;
            $scope.$emit('slide');
            $scope.loading_extra = true;

            $http({
                method: method,
                url: "/api/v4/submission/" + $scope.sid + "/file/" + sha256 + "/",
                data: data
            })
                .success(function (data) {
                    $scope.render_file(data, name);
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    $scope.loading_extra = false;
                    if (status === 404){
                        $scope.render_file(data, name);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        $scope.get_final_data = function () {
            $scope.outstanding = null;
            $http({
                method: 'GET',
                url: "/api/v4/help/configuration/"
            }).success(function (data){
                $scope.configuration = data.api_response;
            }).error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }
            });

            $http({
                method: 'GET',
                url: "/api/v4/submission/" + $scope.sid + "/"
            })
                .success(function (data) {
                    $scope.data = data.api_response;
                    $scope.data.parsed_errors = {
                        listed: $scope.relevant_errors($scope.data.errors),
                        aggregated: $scope.futile_errors($scope.data.errors)
                    };
                    if ($scope.data.state === "completed" || $scope.data.state === "failed") {
                        $scope.get_summary();
                        $scope.get_file_tree();
                        $scope.temp_data = null;
                        $scope.temp_res = Object();
                        $scope.temp_errors = Object();
                        $scope.file_res = Object();
                        $scope.file_errors = Object();
                        $scope.completed = true;
                        $scope.started = true;
                    } else {
                        if ($scope.final_timeout_count === 10) {
                            $scope.final_timeout_count = 9;
                        }

                        $scope.final_timeout_count += 1;
                        $timeout(function () {
                            $scope.setup_watch_queue(true);
                        }, 500 * $scope.final_timeout_count);
                    }
                    $scope.max_classification = get_max_c12n(data.api_response.classification);
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }
                    $scope.loading = false;

                    if (status === 404) {
                        $timeout(function () {
                            swal({
                                    title: "Submission ID does not exists",
                                    text: "\nThe selected submission ID cannot be found it the system. You'll be returned to the list of your submissions...",
                                    type: "error",
                                    confirmButtonColor: "#d9534f",
                                    confirmButtonText: "Close",
                                    closeOnConfirm: false
                                },
                                function () {
                                    $window.location = "/submissions.html";
                                });
                        }, 100);
                        return;
                    } else if (status === 403) {
                        $timeout(function () {
                            swal({
                                    title: "Access denied",
                                    text: "\nYou do not have access to the page you've requested. You'll be returned to the list of your submissions...",
                                    type: "error",
                                    confirmButtonColor: "#d9534f",
                                    confirmButtonText: "Close",
                                    closeOnConfirm: false
                                },
                                function () {
                                    $window.location = "/submissions.html";
                                });
                        }, 100);
                        return;
                    }


                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        $scope.get_summary = function () {
            $http({
                method: 'GET',
                url: "/api/v4/submission/summary/" + $scope.sid + "/"
            })
                .success(function (data) {
                    $scope.attack_matrix = data.api_response.attack_matrix;
                    $scope.summary = data.api_response.tags;
                    $scope.tag_map = data.api_response.map;
                    $scope.heuristics = data.api_response.heuristics;
                    if (data.api_response.filtered){
                        $scope.filtered = true;
                    }
                    if (data.api_response.partial){
                        $scope.partial = true;
                    }
                    $timeout(function (){
                        $scope.max_classification = get_max_c12n($scope.max_classification, data.api_response.classification);
                    });
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    $scope.loading = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        $scope.get_file_tree = function () {
            $http({
                method: 'GET',
                url: "/api/v4/submission/tree/" + $scope.sid + "/"
            })
                .success(function (data) {
                    if ($scope.file_tree != null) {
                        //ReDraw hack because angular templates are fucked up...
                        $scope.file_tree = null;
                        $timeout(function () {
                            $scope.file_tree = data.api_response.tree;
                        })
                    } else {
                        $scope.file_tree = data.api_response.tree;
                    }
                    if (data.api_response.filtered){
                        $scope.filtered = true;
                    }
                    if (data.api_response.partial){
                        $scope.partial = true;
                    }
                    $timeout(function (){
                        $scope.max_classification = get_max_c12n($scope.max_classification, data.api_response.classification);
                    });
                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    $scope.loading = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        $scope.setup_watch_queue = function (from_start, p_suffix) {
            let params = {};
            if (p_suffix !== undefined) {
                params = {suffix: p_suffix};
            }

            $http({
                method: 'GET',
                url: "/api/v4/live/setup_watch_queue/" + $scope.sid + "/",
                params: params
            })
                .success(function (data) {
                    $scope.wq = data.api_response.wq_id;
                    mySocket.emit("listen", {wq_id: $scope.wq, from_start: from_start});

                })
                .error(function (data, status, headers, config) {
                    if (status === 401){
                        window.location = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }

                    if (data === "" || data === null) {
                        return;
                    }

                    $scope.loading = false;
                    if (data.api_error_message) {
                        $scope.error = data.api_error_message;
                    } else {
                        $scope.error = config.url + " (" + status + ")";
                    }

                });
        };

        //Display temporary results
        $scope.draw_temp_data = function () {
            if ($scope.data == null) {
                if ($scope.temp_data == null) {
                    $scope.error = "Nothing to draw ?! That's not right...";
                    return;
                } else {
                    $scope.data = $scope.temp_data;
                }

            }

            $scope.summary = {};
            $scope.tag_map = {};
            $scope.file_tree = {};

            //TODO: load file tree from file info...
            for (let idx in $scope.data.fileinfo) {
                let file_item = $scope.data.fileinfo[idx];
                $scope.file_tree[file_item.sha256] = {};
                $scope.file_tree[file_item.sha256]['name'] = file_item.original_filename;
                $scope.file_tree[file_item.sha256]['score'] = 0;
                $scope.file_tree[file_item.sha256]['children'] = {};
            }
        };

        $scope.draw_results = function () {
            for (let key in $scope.temp_res) {
                $scope.update_summary(key, $scope.temp_res[key]);
                $scope.update_filetree(key, $scope.temp_res[key]);
                if ($scope.file_res[key.substr(0, 64)] === undefined) {
                    $scope.file_res[key.substr(0, 64)] = [];
                }
                $scope.file_res[key.substr(0, 64)].push(key);
            }
            $scope.temp_res = {};

            for (let key_err in $scope.temp_errors) {
                $scope.update_errors(key_err, $scope.temp_errors[key_err]);
                if ($scope.file_errors[key_err.substr(0, 64)] === undefined) {
                    $scope.file_errors[key_err.substr(0, 64)] = [];
                }
                $scope.file_errors[key_err.substr(0, 64)].push(key_err);
            }
            $scope.temp_errors = {};

            $scope.redraw_rate = Math.min(Math.max(3000, $scope.num_files * 100), 15000);
        };

        $scope.update_errors = function (key) {
            //console.log("Update errors with", key, " => ", result);
            if (!$scope.data.hasOwnProperty('errors')) {
                $scope.data['errors'] = [];
            }

            $scope.data['errors'].push(key);
            $scope.data.parsed_errors = {
                listed: $scope.relevant_errors($scope.data.errors),
                aggregated: $scope.futile_errors($scope.data.errors)
            }
        };

        $scope.update_summary = function (key, result) {
            key = key.substr(0, 64);
            if ($scope.summary == null) {
                $scope.summary = {};
            }

            if ($scope.tag_map == null) {
                $scope.tag_map = {};
            }

            if (!$scope.tag_map.hasOwnProperty(key)) {
                $scope.tag_map[key] = [];
            }

            for (let section_id in result['result']['sections']) {
                let section = result['result']['sections'][section_id];
                let h_type = "info";
                if (section.heuristic !== null && section.heuristic !== undefined){
                    if (section.heuristic.score < 100) {
                        h_type = 'info';
                    }
                    else if (section.heuristic.score < 1000){
                        h_type = "suspicious";
                    }
                    else{
                        h_type = "malicious";
                    }
                }

                for (let tag_id in section['tags']){
                    let tag = section['tags'][tag_id];
                    let summary_type = null;
                    if ($scope.configuration['submission.tag_types.attribution'].indexOf(tag.type) !== -1) {
                        summary_type = 'attribution'
                    }
                    else if ($scope.configuration['submission.tag_types.behavior'].indexOf(tag.type) !== -1) {
                        summary_type = 'behavior'
                    }
                    else if ($scope.configuration['submission.tag_types.ioc'].indexOf(tag.type) !== -1) {
                        summary_type = 'ioc'
                    }

                    if (summary_type === null){
                        continue
                    }

                    if (!$scope.summary.hasOwnProperty(summary_type)) {
                        $scope.summary[summary_type] = {};
                    }

                    if (!$scope.summary[summary_type].hasOwnProperty(tag.type)) {
                        $scope.summary[summary_type][tag.type] = [];
                    }

                    let exists = false;
                    let tag_val = [tag.value, h_type];
                    for (let i in $scope.summary[summary_type][tag.type]) {
                        if ($scope.summary[summary_type][tag.type][i] === tag_val) {
                            exists = true;
                            break;
                        }
                    }

                    if (!exists) {
                        $scope.summary[summary_type][tag.type].push(tag_val);
                    }

                    let tag_key = tag.type + $scope.splitter + tag.value;
                    $scope.tag_map[key].push(tag_key);
                    if (!$scope.tag_map.hasOwnProperty(tag_key)) {
                        $scope.tag_map[tag_key] = [];
                    }
                    $scope.tag_map[tag_key].push(key);
                }
            }
        };

        $scope.get_file_name_from_sha256 = function (sha256) {
            for (let i in $scope.data.files) {
                if ($scope.data.files[i].sha256 === sha256) {
                    return $scope.data.files[i].name
                }
            }

            return null;
        };

        $scope.update_filetree = function (key, result) {
            key = key.substr(0, 64);
            if ($scope.file_tree == null) {
                $scope.file_tree = {};
            }

            let to_update = $scope.search_file_tree(key, $scope.file_tree);

            if (to_update.length === 0) {
                let fname = $scope.get_file_name_from_sha256(key);

                if (fname != null) {
                    $scope.file_tree[key] = {};
                    $scope.file_tree[key]['children'] = {};
                    $scope.file_tree[key]['name'] = [fname];
                    $scope.file_tree[key]['score'] = 0;
                    $scope.file_tree[key]['type'] = "N/A";
                    $scope.num_files += 1;
                    to_update.push($scope.file_tree[key]);
                } else {
                    fname = key;
                    if (!$scope.file_tree.hasOwnProperty("TBD")) {
                        $scope.file_tree["TBD"] = {};
                        $scope.file_tree["TBD"]['children'] = {};
                        $scope.file_tree["TBD"]['name'] = "Undertermined Parent";
                        $scope.file_tree["TBD"]['score'] = 0;
                        $scope.file_tree["TBD"]['type'] = "N/A";
                    }

                    $scope.file_tree["TBD"]['children'][key] = {};
                    $scope.file_tree["TBD"]['children'][key]['children'] = {};
                    $scope.file_tree["TBD"]['children'][key]['name'] = [fname];
                    $scope.file_tree["TBD"]['children'][key]['score'] = 0;
                    $scope.file_tree["TBD"]['children'][key]['type'] = "N/A";
                    $scope.num_files += 1;

                    to_update.push($scope.file_tree["TBD"]['children'][key]);
                }

            }
            let to_del_tbd = [];
            for (let idx in to_update) {
                let item = to_update[idx];
                if (result.result['score'] !== undefined) {
                    item['score'] = item['score'] + result.result['score'];
                }

                for (let i in result.response.extracted) {
                    let sha256 = result.response.extracted[i].sha256;
                    let name = result.response.extracted[i].name;

                    if (!item['children'].hasOwnProperty(sha256)) {
                        if ($scope.file_tree.hasOwnProperty("TBD") && $scope.file_tree["TBD"]['children'].hasOwnProperty(sha256)) {
                            item['children'][sha256] = $scope.file_tree["TBD"]['children'][sha256];
                            item['children'][sha256]['name'] = [name];
                            if (to_del_tbd.indexOf(sha256) === -1) to_del_tbd.push(sha256);
                        } else {
                            item['children'][sha256] = {};
                            item['children'][sha256]['children'] = {};
                            item['children'][sha256]['name'] = [name];
                            item['children'][sha256]['score'] = 0;
                            item['children'][sha256]['type'] = 'N/A';
                            $scope.num_files += 1;
                        }
                    } else {
                        item['children'][sha256]['name'].push(name)
                    }

                }
            }

            for (let idx_del in to_del_tbd) {
                delete $scope.file_tree["TBD"]['children'][to_del_tbd[idx_del]];
            }
        };

        $scope.search_file_tree = function (sha256, tree) {
            let output = [];
            for (let key in tree) {
                if ($scope.obj_len(tree[key]['children']) !== 0) {
                    output.push.apply(output, $scope.search_file_tree(sha256, tree[key]['children']));
                }
                if (key === sha256) {
                    output.push(tree[key]);
                }
            }
            return output;
        };

        $scope.reload_messages = function () {
            let ret_val = {get_final: false, queue_from_start: false};

            let temp = sessionStorage.getItem("msg_" + $scope.sid);
            let temp_err = sessionStorage.getItem("error_" + $scope.sid);

            if (temp != null) {
                $scope.messages = JSON.parse(temp);
            }
            if (temp_err != null) {
                $scope.messages_error = JSON.parse(temp_err);
            }

            if ($scope.messages.length === 0) {
                ret_val.queue_from_start = true;
            } else if ($scope.messages[$scope.messages.length - 1] !== "stop") {
                for (let i = 0; i < $scope.messages.length; i++) {
                    if ($scope.messages[i] === "start") {
                        $scope.started = true;
                        $scope.draw_temp_data();
                        $scope.temp_data = null;
                        ret_val.queue_from_start = false;
                    } else {
                        $scope.temp_keys.result.push($scope.messages[i]);
                    }
                }
                for (let y = 0; y < $scope.messages_error.length; y++) {
                    $scope.temp_keys.error.push($scope.messages_error[y]);
                }
                $scope.timed_redraw();
            } else {
                ret_val.get_final = true;
            }

            return ret_val;
        };

        //Load params from datastore
        $scope.start = function () {
            if ($scope.sid == null || $scope.sid === "") {
                $timeout(function () {
                    swal({
                            title: "Error",
                            text: "\nInvalid SID provided. You'll be returned to the list of user submissions...",
                            type: "error",
                            confirmButtonColor: "#d9534f",
                            confirmButtonText: "Close",
                            closeOnConfirm: false
                        },
                        function () {
                            $windows.location = "/submissions.html"
                        });
                }, 100);
            } else {
                $scope.get_final_data();
            }
        };
    });

