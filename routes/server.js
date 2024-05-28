// server.js
import express from "express";
import mysql from 'mysql';
import cors from 'cors';
import session from "express-session";
import MySQLStore from 'express-mysql-session';
import cookieParser from "cookie-parser";

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

const con = mysql.createConnection({
    host: 'localhost',
    port: '3308',
    user: 'root',
    password: '',
    database: 'bloodbank'
});

const MySQLStoreWithSession = MySQLStore(session);
const sessionStore = new MySQLStoreWithSession({
    expiration: 10080000,
    createDatabaseTable: true,
    schema: {
        tableName: 'sessiontbl',
        columnsNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
}, con);

app.use(session({
    secret: "rGK$#&9l@wqBcU3m",
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24h cookie age
        secure: false
    }
}));

export { app, con };
