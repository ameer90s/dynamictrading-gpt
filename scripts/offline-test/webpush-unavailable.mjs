// NOT the genuine web-push. Local test import guard only.
const fail = () => {throw new Error('REAL_WEB_PUSH_NOT_INSTALLED__OFFLINE_TEST_ONLY');};
export default {sendNotification:fail,setVapidDetails:fail,generateVAPIDKeys:fail};
