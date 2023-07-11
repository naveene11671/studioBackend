const { OAuth2Client } = require('google-auth-library')

const oAuth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET,'postmessage')

const verifyGoogle = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization
        const token = authHeader.split(' ')[1]

        const ticket = await oAuth2Client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
        })

        const payload = ticket.getPayload()
        if (payload) {
            req.userId = payload['sub']
            next()
        }
    } catch (error) {
      res.status(401).json({msg: "not authenticated"})
    }
}

module.exports = {
    verifyGoogle,
    oAuth2Client
}