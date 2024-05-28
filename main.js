
import { app } from "./server.js";
import usersRouter from "./routes/users.js";
import authenticationRouter from "./routes/authentication.js";
import adminRouter from "./routes/admin.js";

const PORT = process.env.PORT || 3000;

app.use('/', usersRouter);
app.use('/', authenticationRouter);
app.use('/', adminRouter);

app.listen(PORT, () => {
    console.log(`Running on port :${PORT}`);
});
