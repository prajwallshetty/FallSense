// Extends app.json with values that must not be committed.
// google-services.json / GoogleService-Info.plist are required for native FCM push tokens.
// Provide them locally (git-ignored) or through EAS file secrets:
//   eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
const fs = require('fs');

module.exports = ({ config }) => {
  const androidGoogleServices =
    process.env.GOOGLE_SERVICES_JSON ||
    (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);
  const iosGoogleServices =
    process.env.GOOGLE_SERVICES_PLIST ||
    (fs.existsSync('./GoogleService-Info.plist') ? './GoogleService-Info.plist' : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(androidGoogleServices ? { googleServicesFile: androidGoogleServices } : {}),
    },
    ios: {
      ...config.ios,
      ...(iosGoogleServices ? { googleServicesFile: iosGoogleServices } : {}),
    },
    extra: {
      ...(config.extra || {}),
      ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
    },
  };
};
