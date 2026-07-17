import { rootRoute } from "./routes/root";
import { signInRoute } from "./routes/sign-in";
import { signUpRoute } from "./routes/sign-up";
import { appRoute } from "./routes/app";
import { dashboardRoute } from "./routes/dashboard";
import { transactionsRoute } from "./routes/transactions";
import { remindersRoute } from "./routes/reminders";
import { lendingRoute } from "./routes/lending";
import { dailyRoute } from "./routes/daily";
import { gstRoute } from "./routes/gst";
import { billsRoute } from "./routes/bills";
import { activityRoute } from "./routes/activity";
import { settingsRoute } from "./routes/settings";

export const routeTree = rootRoute.addChildren([
  signInRoute,
  signUpRoute,

  appRoute.addChildren([
    dashboardRoute,
    transactionsRoute,
    remindersRoute,
    lendingRoute,
    dailyRoute,
    gstRoute,
    billsRoute,
    activityRoute,
    settingsRoute,
  ]),
]);
