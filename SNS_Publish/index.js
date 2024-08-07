const AWS = require("@aws-sdk/client-sns");
const sns = new AWS.SNS();

exports.handler = async (event, context) => {
    const { messageSubject, messageContent, topicArn } = JSON.parse(event.body);

    const params = {
        Message: messageContent,
        Subject: messageSubject,
        TopicArn: topicArn
    };

    try {
        console.log(params.Message);
        const response = await sns.publish(params);
        console.log('Message sent:', response.MessageId);
        return {
            statusCode: 200,
            body: 'Email sent successfully'
        };
    } catch (err) {
        console.error('Error sending message:', err);
        return {
            statusCode: 500,
            body: 'Error sending email'
        };
    }
};