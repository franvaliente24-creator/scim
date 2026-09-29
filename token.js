// Per-tab authentication token — stored in sessionStorage, which browsers
// scope per-tab. This isolates concurrent logins (e.g. Manager in tab A and
// Admin in tab B no longer collide on a shared cookie).
(function () {
    var KEY = 'scim_token';
    var TICKET_KEY = 'scim_mfa_ticket';

    window.scimSetToken = function (t) { sessionStorage.setItem(KEY, t); };
    window.scimGetToken = function () { return sessionStorage.getItem(KEY); };
    window.scimClearToken = function () { sessionStorage.removeItem(KEY); };

    window.scimSetTicket = function (t) { sessionStorage.setItem(TICKET_KEY, t); };
    window.scimGetTicket = function () { return sessionStorage.getItem(TICKET_KEY); };
    window.scimClearTicket = function () { sessionStorage.removeItem(TICKET_KEY); };

    var _fetch = window.fetch.bind(window);
    window.fetch = function (url, options) {
        options = options || {};
        var isApi = typeof url === 'string' && url.indexOf('/api/v1') !== -1;
        if (isApi) {
            var token = sessionStorage.getItem(KEY);
            if (token) {
                options.headers = Object.assign({}, options.headers || {}, { 'X-SCIM-Token': token });
            }
            // A 401 from a token-authenticated call means this tab's session died
            var p = _fetch(url, options);
            p.then(function (r) {
                if (r.status === 401 && token && !document.body.classList.contains('auth-page')) {
                    sessionStorage.removeItem(KEY);
                }
            }).catch(function () {});
            return p;
        }
        return _fetch(url, options);
    };
})();
