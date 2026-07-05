import { rootRoute } from "./routes/root";
import { authRoute } from "./routes/auth";
import { appRoute } from "./routes/app";
import { dashboardRoute } from "./routes/dashboard";
import { transactionsRoute } from "./routes/transactions";
import { remindersRoute } from "./routes/reminders";
import { lendingRoute } from "./routes/lending";
import { dailyRoute } from "./routes/daily";
import { gstRoute } from "./routes/gst";
import { billsRoute } from "./routes/bills";
import { activityRoute } from "./routes/activity";

export const routeTree = rootRoute.addChildren([
  authRoute,
  appRoute.addChildren([
    dashboardRoute,
    transactionsRoute,
    remindersRoute,
    lendingRoute,
    dailyRoute,
    gstRoute,
    billsRoute,
    activityRoute
  ])
]);
