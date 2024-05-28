import express from "express";
import { con } from "../server.js";
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Dashboard Route [API : http://localhost:3000/dashboard]
router.get('/dashboard', (req, res) => {
    console.log("Session in Dashboard:", req.session);
    console.log("Role in Dashboard:", req.session.role);
    if (parseInt(req.session.role) !== 1) return res.status(401).send("Only authorized for Admins");
    return res.status(200).send("Welcome Admin");
});

// Validate user Route [API : http:localhost3000/updateuser]
router.patch("/updateuser", [
    // Schema validation using express-validator
    body('userId').notEmpty().isInt() // Assuming userId is required and should be an integer
], (req, res) => {
    if(req.session.role !== 2) return res.status(401).json({Message : "Only admins are authorized"})
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }

    const { userId } = req.body;

    // Query to fetch the role associated with the userId from the request table
    const selectQuery = "SELECT role FROM request WHERE idUser = ?";

    con.query(selectQuery, [userId], (err, result) => {
        if(err) {
            console.error("Error occurred while fetching user role:", err);
            return res.status(500).json({ Message: 'An error occurred while fetching user role' });
        }

        if(result.length === 0) {
            return res.status(404).json({ Message: 'No role found for the specified user' });
        }

        const requestedRole = result[0].role;

        // Update the user's role in the userinfo table
        const updateQuery = "UPDATE userinfo SET role = ? WHERE id = ?";
        con.query(updateQuery, [requestedRole, userId], (updateErr, updateResult) => {
            if(updateErr) {
                console.error("Error occurred while updating user role:", updateErr);
                return res.status(500).json({ Message: 'An error occurred while updating user role' });
            }
            return res.status(200).json({ Message: "User role updated successfully" });
        });
    });
});


// Select Manager API [http://localhost:3000/managers]
router.get("/managers", (req, res) => {
    if (req.session.role !== 1) return res.status(400).json({ Message: 'Only Crud authorized in this page' });

    const query = "SELECT * FROM userinfo WHERE role = 2"; // Select all managers 
    con.query(query, (err, result) => {
        if (err) return res.status(401).json({ Message: 'Error occurs while selecting managers' });
        return res.status(200).json(result); // Send the result directly
    });
});

// Add Stroring centre API [http://localhost:3000/addClinic]
router.post("/addStoringCentre", [
    // Schema validation using express-validator
    body('address').notEmpty().isString(),
    body('maxCapacite').notEmpty().isInt(),
    body('centreModerator').notEmpty().isInt(), 
    body('openingTime').notEmpty(),
    body('closingTime').notEmpty()
], (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }
    if(req.session.role !== 1) return req.status(401).json({Message : "Only admins are authorized"});
    // Centre Moderator ??
    const {address, maxCapacite, centreModerator, openingTime, closingTime} = req.body;
    const stroginCentreID = Math.floor(Math.random() * 100000000);
    const query = "INSERT INTO stroingcentre (id,address, maxCapacite, centreModerator, openingTime, closingTime) VALUES (?,?,?,?,?,?)";
    const values = [stroginCentreID, address, maxCapacite, centreModerator, openingTime, closingTime];

    con.query(query, values, (err, result) => {
        if (err) return res.status(400).json({ Message: "Error occurs while adding the storing centre", err})
        return res.status(200).json({ Message: 'Clinic was added successfully' });
    });
});

//Delete StoringCentre API : [http://localhost:3000/deleteClinic]
router.post("/deleteStoringCentre",body('clinicID').notEmpty().isInt(),(req, res)=>{
    const {stroginCentreID} = req.body;

    const query = "DELETE FROM stroingcentre WHERE id = ?";
    con.query(query,[stroginCentreID],(err,result)=>{
        if(err) return res.status(400).json({Error : err})
        return res.status(200).json({Message:'Clinic was removed successfully'});
    })
});

// Update StoringCentre API [http://localhost:3000/updateClinic]
router.patch("/updateStoringCentre", [
    // Schema validation using express-validator
    body('stroginCentreID').notEmpty().isInt(),
    body('address').optional().isString(),
    body('maxCapacite').optional().isInt(),
    body('centreModerator').optional().isInt(), 
    body('openingTime').optional(),
    body('closingTime').optional()
], (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
    }
    if(req.session.role !== 1) return req.status(401).json({Message : "Only admins are authorized"});

    const {stroginCentreID, address, maxCapacite, centreModerator, openingTime, closingTime} = req.body;
    
    // Construct the update query based on the provided fields
    let updateFields = [];
    let updateValues = [];
    if (address !== undefined) {
        updateFields.push('address = ?');
        updateValues.push(address);
    }
    if (maxCapacite !== undefined) {
        updateFields.push('maxCapacite = ?');
        updateValues.push(maxCapacite);
    }
    if (centreModerator !== undefined) {
        updateFields.push('centreModerator = ?');
        updateValues.push(centreModerator);
    }
    if (openingTime !== undefined) {
        updateFields.push('openingTime = ?');
        updateValues.push(openingTime);
    }
    if (closingTime !== undefined) {
        updateFields.push('closingTime = ?');
        updateValues.push(closingTime);
    }

    if (updateFields.length === 0) {
        return res.status(400).json({Message: "No fields provided for update"});
    }

    updateValues.push(stroginCentreID); // Push clinicID for WHERE clause
    
    // Construct and execute the update query
    const query = `UPDATE stroingcentre SET ${updateFields.join(', ')} WHERE id = ?`;
    con.query(query, updateValues, (err, result) => {
        if (err) return res.status(400).json({ Message: "Error occurs while updating the storing centre", err})
        return res.status(200).json({ Message: 'Clinic was updated successfully' });
    });
});

export default router