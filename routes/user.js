// routes/users.js
import express from "express";
import { con } from "../server.js";

const router = express.Router();

router.get('/', (req, res) => {
    const query = 'SELECT * FROM userinfo';
    con.query(query, (err, result) => {
        if (err) return res.json({ Message: "Connection error" });
        return res.json(result);
    })
});

// Reciver Page Route [API : http://localhost:3000/Donor]
router.post('/donor', (req, res) => {
    if (!req.session.userId) return res.status(400).send('Not authenticated');
    console.log("User id : ", req.session.userId);

    // Query to check if user ID already exists in the table
    const checkQuery = "SELECT COUNT(*) AS count FROM request WHERE idUser = ?";
    con.query(checkQuery, [req.session.userId], (checkErr, checkResult) => {
        if (checkErr) {
            console.error("Error occurred while checking user ID:", checkErr);
            return res.status(500).json({ Message: 'An error occurred while checking user ID' });
        }

        // If user ID already exists, return an error message
        if (checkResult[0].count > 0) {
            return res.status(400).json({ Message: 'User ID already exists in the table' });
        }

        // If user ID doesn't exist, proceed with inserting the donor request
        const query = "INSERT INTO request (idRequest , idUser, role) VALUES (?, ?, ?)";
        const reqRole = 3; // Request role for Donor is supposed to be 3
        const idRequest = Math.floor(Math.random() * 100000000);

        con.query(query, [idRequest, req.session.userId, reqRole], (err, result) => {
            if (err) {
                console.error("Error occurred while inserting donor request:", err);
                return res.status(500).json({ Message: 'An error occurred while inserting user' });
            }
            return res.status(200).json({ Message: 'New Donor Request has been added', result });
        });
    });
});

// Reciver Page Route [API : http://localhost:3000/reciver]
router.post('/reciver', (req, res) => {
    if (!req.session.userId) return res.status(400).send('Not authenticated');
    console.log("User id : ", req.session.userId);

    // Query to check if user ID already exists in the table
    const checkQuery = "SELECT COUNT(*) AS count FROM request WHERE idUser = ?";
    con.query(checkQuery, [req.session.userId], (checkErr, checkResult) => {
        if (checkErr) {
            console.error("Error occurred while checking user ID:", checkErr);
            return res.status(500).json({ Message: 'An error occurred while checking user ID' });
        }

        // If user ID already exists, return an error message
        if (checkResult[0].count > 0) {
            return res.status(400).json({ Message: 'User ID already exists in the table' });
        }

        // If user ID doesn't exist, proceed with inserting the receiver request
        const query = "INSERT INTO request (idRequest , idUser, role) VALUES (?, ?, ?)";
        const reqRole = 4; // Request role for Receiver is supposed to be 4
        const idRequest = Math.floor(Math.random() * 100000000);

        con.query(query, [idRequest, req.session.userId, reqRole], (err, result) => {
            if (err) {
                console.error("Error occurred while inserting receiver request:", err);
                return res.status(500).json({ Message: 'An error occurred while inserting user' });
            }
            return res.status(200).json({ Message: 'New Receiver Request has been added', result });
        });
    });
});


export default router;
