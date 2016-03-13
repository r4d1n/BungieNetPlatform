angular.module('api-test', [])
	.directive('apiTest', function() {
		return {
			templateUrl: '../templates/api-test.html'
		};
	})
	.directive('syntaxHighlight', function($compile, $timeout) {
		return {
			scope: {
				syntaxHighlight: '='
			},
			transclude: true,
			link: function(scope, elem, attrs) {
				scope.$watch('syntaxHighlight', function() {
					elem.empty();

					//console.log(scope.syntaxHighlight);

					if (scope.syntaxHighlight) {
						var code = JSON.stringify(scope.syntaxHighlight, null, 4);
						elem.append('<code class="'+attrs.language+'">'+code+'</code>');
						$compile(elem.contents())(scope);
						var codeElem = elem[0].querySelector('code');
						hljs.highlightBlock(codeElem);
						$timeout(function() {
							$(codeElem).codeFolding();
						}, 100);
					}
				}, true);
			}
		};
	})
	.controller('ApiCtrl', function($scope, $http, $httpParamSerializer, $location) {
		$scope.apiKey = '';
		$scope.params = {
			path: {},
			query: {},
			json: {}
		};

		$scope.isReauth = false;
		$scope.isRequesting = false;

		$scope.proxies = [
			{id: "bnetwikiProxy", name: "bnetwiki-proxy.herokuapp.com (Requires API Key)", url: "https://bnetwiki-proxy.herokuapp.com", apiKeyRequired: true},
			{id: "bungieProxy", name: "bungie-proxy.herokuapp.com", url: "https://bungie-proxy.herokuapp.com", apiKeyRequired: false}
		];
		$scope.proxy = $scope.proxies[0];

		$scope.endpoints = [];
		$scope.services = [];
		for (var serviceName in apiData) {
			$scope.services.push(serviceName);
		}
		$scope.services.sort();

		var hasDefaults = false;
		$scope.loadShare = function(share) {
			if (!share) return;
			//console.log('Share', share);

			share = share.split('/').slice(1);

			for (var serviceName in apiData) {
				var service = apiData[serviceName];
				for (var i = 0; i < service.length; i++) {
					var endpoint = service[i];
					if (endpoint.name == share[0]) {
						$scope.service = serviceName;
						$scope.endpoint = endpoint;

						$scope.params.path = {};
						$scope.params.query = {};
						$scope.params.json = {};

						hasDefaults = share.length > 1;

						for (var j=1; j<share.length; j++) {
							var type = share[j].slice(0, 1);
							var paramData = false;
							switch (type) {
								case 'p':
									paramData = $scope.params.path;
									break;
								case 'q':
									paramData = $scope.params.query;
									break;
								case 'j':
									paramData = $scope.params.json;
									break;
							}
							if (!paramData) return;

							var params = share[j].slice(2).split(',');
							for (var k = 0; k < params.length; k++) {
								var param = params[k].split('=');
								var paramKey = param[0];
								var paramValue = decodeURIComponent(param[1]);
								if (!isNaN(paramValue)) paramValue = parseInt(paramValue);
								paramData[paramKey] = paramValue;
							}
						}
						//console.log('Share Params', $scope.params);
						break;
					}
				}
			}
		};

		$scope.$on('$locationChangeStart', function(event) {
			$scope.loadShare($location.url());
		});

		if (!$location.url()) $scope.loadShare('/GetDestinyManifest');

		$scope.$watchGroup(['proxy', 'apiKey'], function(proxy) {
			$scope.buildRequest();
		});

		$scope.$watch('service', function(service) {
			//console.log('Changed Service', service);
			if (service == undefined) return;

			$scope.endpoints = [];
			for (var i=0; i<apiData[service].length; i++) {
				apiData[service][i].service = service;
				$scope.endpoints.push(apiData[service][i]);
			}
			if ($scope.endpoints.indexOf($scope.endpoint) == -1) {
				$scope.endpoint = $scope.endpoints[0];
			}
		});

		$scope.$watch('endpoint', function(endpoint) {
			//console.log('Changed Endpoint', endpoint);
			if (endpoint == undefined) return;

			if (!hasDefaults) {
				$scope.params.path = {};
				$scope.params.query = {};
				$scope.params.json = {};
			}
			hasDefaults = false;
			$scope.buildRequest();
		});

		$scope.$watchCollection('params.path', function() {
			//console.log('Path Parameters Changed', $scope.params.path);
			$scope.buildRequest();
		});
		$scope.$watchCollection('params.query', function() {
			//console.log('Query Parameters Changed', $scope.params.query);
			$scope.buildRequest();
		});
		$scope.$watchCollection('params.json', function() {
			//console.log('JSON POST Parameters Changed', $scope.params.json);
			$scope.buildRequest();
		});

		$scope.reauthPlatform = 'Psnid';

		$scope.reauthValid = {};
		for (var i=0; i<$scope.proxies.length; i++) {
			var proxy = $scope.proxies[i];
			var apiAuth = localStorage.getItem(proxy.id);
			apiAuth = apiAuth ? parseInt(apiAuth) : 0;
			$scope.reauthValid[proxy.id] = new Date().getTime() < apiAuth;
		}

		$scope.reauth = function() {
			//console.log('Reauth', $scope.proxy);
			var proxyUrl = $scope.proxy.url;
			//proxyUrl = 'http://localhost:5000';
			$scope.isReauth = true;
			$http({
				method: 'GET',
				url: proxyUrl+'/Reauth/'+$scope.reauthPlatform+'/',
				withCredentials: true,
				headers: {
					'x-bungleatk': $scope.bungleatk
				}
			}).then(function(response) {
				//console.log(response, response.headers());
				$scope.isReauth = false;
				if (response.headers('x-status') == '200') {
					localStorage.setItem($scope.proxy.id, new Date().getTime()+(14*24*60*60*1000));
					$scope.reauthValid[$scope.proxy.id] = true;
				}
			});
		};

		$scope.request = function() {
			var options = $scope.buildRequest();

			console.log('Request', options);

			$scope.isRequesting = true;
			$http(options).then(function(response) {
				response.status = response.headers('x-status');
				console.log('Response', {status: response.status, headers: response.headers(), data: response.data});
				$scope.isRequesting = false;
				$scope.test.response = response;
			});
		};

		$scope.fieldOptions = function(link) {
			var options = [];
			link = link.split('#');
			switch(link[0]) {
				case 'Enums':
					if (apiEnums[link[1]]) {
						options = apiEnums[link[1]];
					}
					break;
			}
			//console.log(link, options);
			return options;
		};

		$scope.hasParams = function(params) {
			if (params == null) return 0;
			return Object.keys(params).length;
		};

		$scope.buildRequest = function() {
			if ($scope.endpoint == undefined) return;

			var proxyUrl = $scope.proxy.url;
			var headers = {};
			if ($scope.apiKey) headers['x-api-key'] = $scope.apiKey;

			var params = $scope.params;

			//console.log(params);

			var url = '/Platform'+$scope.endpoint.endpoint;
			for (var key in params.path) {
				url = url.replace('{'+key+'}', params.path[key]);
			}
			var query = $httpParamSerializer(params.query);
			if (query) url += '?'+query;

			var options = {
				method: $scope.endpoint.method,
				url: proxyUrl+url,
				path: url,
				withCredentials: true,
				headers: headers
			};

			if (Object.keys(params.json).length > 0) options.data = params.json;

			var shareLink = $location.absUrl().split('#')[0]+'#/'+$scope.endpoint.name;
			for (var key in params) {
				var paramsData = params[key];
				if (Object.keys(paramsData).length == 0) continue;
				switch(key) {
					case 'path': shareLink += '/p::'; break;
					case 'query': shareLink += '/q:'; break;
					case 'json': shareLink += '/j:'; break;
				}
				var paramsShare = [];
				for (var paramKey in paramsData) {
					paramsShare.push(paramKey+'='+encodeURIComponent(paramsData[paramKey]));
				}
				shareLink += paramsShare.join(',');
			}

			$scope.test = {
				share: shareLink,
				request: options,
				response: null
			};

			return options;
		};
	})
;