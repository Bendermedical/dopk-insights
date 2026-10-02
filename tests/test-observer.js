/* Capture browser failures before the dashboard and test runner load. */
window.DOPK_TEST_ERRORS = [];
window.addEventListener("error", e => window.DOPK_TEST_ERRORS.push(e.message));
window.addEventListener("unhandledrejection", e => window.DOPK_TEST_ERRORS.push(String(e.reason)));
window.addEventListener("securitypolicyviolation", e => window.DOPK_TEST_ERRORS.push("CSP: " + e.violatedDirective));
