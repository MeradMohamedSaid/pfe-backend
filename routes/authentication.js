// routes/authentication.js
import express from "express";
import { con } from "../server.js";
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';

const router = express.Router();

// Sign up Route [API : http://localhost:3000/signup]
router.post('/signup', [
    // Schema validation using express-validator
    body('name').notEmpty().isString(),
    body('age').notEmpty().isInt(),
    body('address').notEmpty().isString(),
    body('phone').notEmpty().isString(),
    body('sex').notEmpty().isBoolean(),
    body('email').notEmpty().isLength({ min: 13, max: 64 }).isEmail(),
    body('password').notEmpty().isLength({ min: 8, max: 255 }).isString()
], (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }

    const { name, age, address, phone, sex, email, password } = req.body;

    try {
        const userId = Math.floor(Math.random() * 100000000);
         
        // Hash the password using SHA-256
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        const role = 0; // Assuming role 0 is for regular users

        // Create a new user record in the database
        const query = 'INSERT INTO userinfo (id, name, age, address, phone, sex, email, password, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const values = [userId, name, age, address, phone, sex, email, hashedPassword, role];

        con.query(query, values, (err, result) => {
            if (err) {
                console.error("Error signing up:", err);
                return res.status(500).json({ message: "An error occurred while signing up." });
            }

            req.session.userId = userId;
            req.session.role = role; // Assuming you have a 'role' field in your database
            req.session.visited = true;
            console.log(req.session);
            return res.status(200).json({ message: "User signed up successfully.", userId });
        });
    } catch (error) {
        console.error("Error signing up:", error);
        res.status(500).json({ message: "An error occurred while signing up." });
    }
});

// Login Route [API : http://localhost:3000/login]
router.post('/login', [
    // Schema validation using express-validator
    body('email').notEmpty().isLength({ min: 13, max: 64 }).isEmail(),
    body('password').notEmpty().isLength({ min: 8, max: 255 }).isString()
], (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    const query = "SELECT * FROM userinfo WHERE email = ? and password = ?";
    con.query(query, [email, hashedPassword], (err, result) => {
        if (err) {
            console.error("Error login:", err);
            return res.status(500).json({ message: "An error occurred while logging in." });
        }
        if (result.length > 0) {
            req.session.userId = result[0].id;
            req.session.role = result[0].role; // Assuming you have a 'role' field in your database
            req.session.visited = true;

            console.log("User's role:", req.session.role); // Log the user's role
            console.log("Session:", req.session); // Log the session object

            // Return the user's role in the response
            return res.json({ role: result[0].role });
        } else {
            return res.status(401).json({ Message: "Invalid credentials" });
        }
    });
});

export default router;