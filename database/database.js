const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: 'restaurant-explorer.cmnbvibaujyp.us-east-1.rds.amazonaws.com',
    user: 'root',
    password: 'password',
    database: 'restaurantexplorer'
});

module.exports.db = db;
