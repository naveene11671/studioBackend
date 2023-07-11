const router = require('express').Router();
const { UserRefreshClient } = require('google-auth-library');
const { verifyGoogle, oAuth2Client } = require('../middleware/verifyGoogle');
const User = require('../models/User')
const jwt = require('jsonwebtoken');
const { google } = require('googleapis')

const REFRESH_TOKEN = "1//0gkSnhgp0EqAkCgYIARAAGBASNwF-L9IrsVO65X25QZquayVPGT5lWQgZT2l4otkMhpT65-56DIwkfX4JEGO2HPS8lGow1n2JNhg"
//Register
router.post("/register", async (req, res) => {
    const newUser = new User({
        username: req.body.username,
        email: req.body.email,
        password: req.body.password,
        lastname: req.body.lastname,
        name: req.body.name
    })
    try {
        const savedUser = await newUser.save();
        const count = await User.countDocuments({})
        if (count == 1) {
            await User.findOneAndUpdate({ email: req.body.email }, {
                isAdmin: true,
                status: 'approved',
                role: 'admin'
            })
        }
        res.status(201).json({ msg: "user registered successfully" });
    } catch (error) {
        res.status(500).json(error);
    }
})

//LOGIN
router.post("/login", async (req, res) => {
    try {
        //finding user with the provided username
        const user = await User.findOne({ email: req.body.email });

        //if user does not exist
        if (!user) {
            return res.status(401).json("Wrong credentials");
        }
        //calling insatance method to comparehashed password
        const isMatch = await user.comparePassword(req.body.password);
        if (!isMatch) {
            return res.status(401).json("Wrong credentials");
        }
        if (user.status == 'pending') {
            return res.status(403).json("Not approved by admin")
        }
        //if every thing is okay then send the user details except password
        const accestoken = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE })
        const { password, ...others } = user._doc;
        res.status(201).json({ ...others, accestoken });
    } catch (error) {
        res.status(500).json(error.message);
        console.log(error)
    }
})

router.get("/protected", verifyGoogle, async (req, res) => {
    try {
        res.send({ msg: "awesome it works" })
    } catch (error) {
        res.send("there is some error")
    }
})

router.post("/google/register", async (req, res) => {
    // console.log(req.body)
    const { tokens } = await oAuth2Client.getToken(req.body.code); // exchange code for tokens
    // console.log(tokens);

    const ticket = await oAuth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID
    })

    const payload = ticket.getPayload()
    if (payload && tokens) {
        // console.log(payload)
        // console.log(tokens)
        const newUser = new User({
            email: payload?.email,
            lastname: payload?.family_name,
            name: payload?.given_name,
            img: payload?.picture,
            googleId: payload.sub,
            refreshTokenGoogle: tokens.refresh_token
        })
        try {
            await newUser.save();
            const count = await User.countDocuments({})
            if (count == 1) {
                await User.findOneAndUpdate({ email: payload.email }, {
                    isAdmin: true,
                    status: 'approved',
                    role: 'admin'
                })
            }
            return res.status(201).json({ msg: "user registered successfully" });
        } catch (error) {
            return res.status(500).json({ msg: error.message });
        }

    }

    res.status(401).send("not authorized");
})

router.post("/google/login", async (req, res) => {
    // console.log(req.body)
    const { tokens } = await oAuth2Client.getToken(req.body.code); // exchange code for tokens
    console.log(tokens);

    const ticket = await oAuth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID
    })

    const payload = ticket.getPayload()
    if (payload) {
        const user = await User.findOne({ googleId: payload.sub })
        if (!user) {
            return res.status(401).json({ msg: "not authorized, please register" })
        }
        if(user.status == 'pending'){
            return res.status(401).json({msg: "not approved by admin yet"})
        }
        //updating refresh token
        await User.findOneAndUpdate({
            googleId: payload.sub
        },{
            refreshTokenGoogle: tokens.refresh_token
        })
        const {refreshTokenGoogle,...data} = user._doc
        return res.status(201).json({ ...data, ...payload })
    }

    res.status(401).send("not authorized");
})

router.get('/protected/calendar/refresh-token', async (req, res) => {
    const user = new UserRefreshClient(
        process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET,
        REFRESH_TOKEN,
    );
    const { credentials } = await user.refreshAccessToken(); // optain new tokens
    res.json(credentials);
})


//first response when signed in
//   access_token
//   : 
//   "ya29.a0AWY7CklOYxwmQCVgSxeyOMs9iOVi727-4AE3G39QM4LVCLilOnWTw4WSREIi1dzAehk8no5KXx2HatQX8FSH3Ormd-FZfpEPP9A4vT6FN2P9tVpofsZrfRG2EoVtlwE7EM0uaSyId4AW_aj9RZLI6RWX9-KQaCgYKAb4SARESFQG1tDrp4_8qRqZYaKcZ6bmcFIfGYA0163"
//   expiry_date
//   : 
//   1685647071904
//   id_token
//   : 
//   "eyJhbGciOiJSUzI1NiIsImtpZCI6IjYwODNkZDU5ODE2NzNmNjYxZmRlOWRhZTY0NmI2ZjAzODBhMDE0NWMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiIyNzAxNzQ4NTgxNzktbWx1MDlhYW84dnFsOTU4MzkyZW05ZDNwbmo4NWhzcmUuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiIyNzAxNzQ4NTgxNzktbWx1MDlhYW84dnFsOTU4MzkyZW05ZDNwbmo4NWhzcmUuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDI5NjcxOTE5NTg4ODUyNTg4MTYiLCJlbWFpbCI6ImFua3VzaGd1cHRhMzY1QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJhdF9oYXNoIjoiUzFCSEVRQXluWlVCeE5CYkI0eEpQUSIsIm5hbWUiOiJBbmt1c2ggR3VwdGEiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUFjSFR0Y0plbFRKWTZyRWpHelkzNEZSVnBiMEstV1JTUVRlc0xjeGUwcnRsUT1zOTYtYyIsImdpdmVuX25hbWUiOiJBbmt1c2giLCJmYW1pbHlfbmFtZSI6Ikd1cHRhIiwibG9jYWxlIjoiZW4iLCJpYXQiOjE2ODU2NDM0NzQsImV4cCI6MTY4NTY0NzA3NH0.kyi5DEojAd7MGTxkdQDesW-TJHv78qyS66KWNSjWDT9HiljUy8KQeOyh5DshYLXjFXgfcm-E8SW7G1nXulrZ257QWz9WZugNIDToVaji-seV8kuaicr63TU6tZK5cQfh0wVgkZYy2REFR3rb0F-YklxufxK8XoqadMm9IY2pcrWtDkKkrTrizZxenlInR3BLrLF3bywDCayVIFj-rrq5bSF3bnC7UsYzJoOqDOZDNL-7ubEz46C5l_4vB6pvYM_8lS-7T--ZPF5_sqn5smMb9lb0YxcYMZ6MgL-zyoQRTRgAnVj2Goja1r8JKfB0HRTW0a_WX8uQmZL6CibO9irWRg"
//   refresh_token
//   : 
//   "1//0gkSnhgp0EqAkCgYIARAAGBASNwF-L9IrsVO65X25QZquayVPGT5lWQgZT2l4otkMhpT65-56DIwkfX4JEGO2HPS8lGow1n2JNhg"
//   scope
//   : 
//   "https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email"
//   token_type
//   : 
//   "Bearer"
module.exports = router