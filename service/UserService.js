const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../database/database');
const {generateToken} = require('../auth/AuthToken');
const { AWS_AUTH } = require('../config/config');
const AWS = require("@aws-sdk/client-sns");
const Cognito = require('amazon-cognito-identity-js');
const AWS_SDK = require('aws-sdk');

class UserService {
    async signup(userDetails) {
        // try {
        //     // Set up AWS Cognito user pool data
        //     const poolData = { UserPoolId: 'us-east-1_qmLKxaDMq', ClientId: '7dk5snjrjht74hijgi5s0hm63l' };
        //     const userPool = new Cognito.CognitoUserPool(poolData);
        //     const attributeList = [];

        //     // Add user attributes
        //     attributeList.push(new Cognito.CognitoUserAttribute({ Name: "name", Value: userDetails.name }));
        //     attributeList.push(new Cognito.CognitoUserAttribute({ Name: "phone_number", Value: userDetails.phone }));
        //     attributeList.push(new Cognito.CognitoUserAttribute({ Name: "address", Value: userDetails.address }));
        //     attributeList.push(new Cognito.CognitoUserAttribute({ Name: "picture", Value: userDetails.pictureUrl }));
        //     attributeList.push(new Cognito.CognitoUserAttribute({ Name: "email", Value: userDetails.email }));

        //     // Register user with Cognito
        //     console.log("cognito one");
        //     userPool.signUp(userDetails.email, userDetails.password, attributeList, null, (err, result) => {
        //         if (err) {
        //             console.log("cognito two");
        //             result.status(500).send(err.message || JSON.stringify(err));
        //             return {
        //                 status: 500,
        //                 err: err.message
        //             };
        //         }
        //         console.log("cognito three");
        //         return {
        //             status: 200,
        //             message: "User registered successfully"
        //         };
        //     });
        // } catch(err) {
        //     console.log("cognito four");
        //     console.log(err);
        // }
        try {        
            console.log("rds one");        
            await db.execute(
                `CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY, 
                    email VARCHAR(255) NOT NULL, 
                    password VARCHAR(255) NOT NULL, 
                    name VARCHAR(255) NOT NULL, 
                    phone VARCHAR(255) NOT NULL, 
                    address VARCHAR(255) NOT NULL, 
                    secretKey VARCHAR(255))`
            );
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [userDetails.email]);

            if (rows.length > 0) {
                return {
                    status: 400,
                    error: 'User already exists'
                };
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(userDetails.password, salt);

            await db.execute('INSERT INTO users (email, password, name, phone, address, secretKey) VALUES (?, ?, ?, ?, ?, ?)',
                [userDetails.email, hashedPassword, userDetails.name, userDetails.phone, userDetails.address, null]);

            return { 
                status: 200,
                message: 'Signup Successful!'
            };
        } catch (err) {
            console.error(err);
            return {
                status: 500,
                error: 'Internal server error'
            };
        }
    }

    async signin(credentials) {
        // try {
        //     const authenticationDetails = new Cognito.AuthenticationDetails({
        //         Username: email,
        //         Password: password,
        //       });
              
        //       const poolData = { UserPoolId: 'us-east-1_qmLKxaDMq', ClientId: '7dk5snjrjht74hijgi5s0hm63l' };
        //       const userPool = new Cognito.CognitoUserPool(poolData);
        //       const userData = {
        //         Username: email,
        //         Pool: userPool,
        //       };
            
        //       const cognitoUser = new Cognito.CognitoUser(userData);
        //       cognitoUser.authenticateUser(authenticationDetails, {
        //         onSuccess: (result) => {
        //           res.send({ message: "User authenticated successfully", token: result.getIdToken().getJwtToken() });
        //         },
        //         onFailure: (err) => {
        //           res.status(400).send(err.message || JSON.stringify(err));
        //         },
        //       });
        // } catch (err) {
        //     console.log(err);
        // }
        try {
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [credentials.email]);
            if (rows.length === 0) {
                return {
                    status: 400,
                    error: 'Invalid credentials'
                }
            }

            const passwordValid = await bcrypt.compare(credentials.password, rows[0].password);

            if (!passwordValid) {
                return { 
                    status: 400,
                    error: 'Invalid credentials' 
                };
            }

            const {token, secretKey} = generateToken({ 
                email: rows[0].email,
                name: rows[0].name
            });

            await db.execute('UPDATE users SET secretKey = ? WHERE email = ?', [secretKey, rows[0].email]);

            AWS_SDK.config.update({ region: 'us-east-1' });

            const bucketName = 'restaurant-explorer';
        
            const params = {
                Bucket: bucketName,
                Key: `profile-pictures/${credentials.email}.jpg`,
                Expires: 86400
            };

            const s3 = new AWS_SDK.S3();
            const profilePicUrl = await s3.getSignedUrlPromise('getObject', params);

            return {
                status: 200,
                message: 'Signin Successful!',
                token: token,
                email: rows[0].email,
                displayUrl: profilePicUrl
            }

        } catch(err) {
            console.error(err);
            return {
                status: 500,
                error: 'Internal server error'
            };
        }
    }

    async getPresignedUrl(event) {
        AWS_SDK.config.update({ region: 'us-east-1' });

        const bucketName = 'restaurant-explorer';
    
        const params = {
            Bucket: bucketName,
            Key: `profile-pictures/${event.email}.jpg`,
            Expires: 86400,
            ContentType: 'image/jpeg'
        };
    
        try {
            const s3 = new AWS_SDK.S3();
            const data = await s3.getSignedUrlPromise('putObject', params);
            return {
                status: 200,
                message: 'Get predefined URL',
                uploadUrl: data
            };
        } catch (err) {
            console.error('Error uploading image:', err);
            return {
                status: 500,
                message: 'Failed to upload image',
                error: err.message
            };
        }
    }

    async subscribeEmail(emailAddress) {
        const params = {
            Protocol: 'email',
            TopicArn: AWS_AUTH.SNS.TOKEN_ARN,
            Endpoint: emailAddress
        };
    
        try {
            const sns = new AWS.SNS();
            const response = await sns.subscribe(params);
            console.log('Subscription ARN:', response.SubscriptionArn);
            return {
                status: 200,
                subscriptionArn: response.SubscriptionArn
            }
        } catch (err) {
            console.error('Error subscribing email address:', err);
            return {
                status: 500,
                error: 'Internal Server Error'
            }
        }
    }
}

module.exports = new UserService();
