const express = require('express');
const app = express();
const mongoose = require("mongoose");
const dotenv = require('dotenv').config();
const cors = require('cors')
const userRoute = require('./routes/user')
const authRoute = require('./routes/auth')
const slotRoute = require('./routes/booking')
const createStudioRoute = require('./routes/studio')
const programRoute = require('./routes/programRoute.js')
mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGO_URL)
        .then(()=>{console.log("DB connection Successfull")})
        .then(()=>app.listen(process.env.PORT || 8800,()=>{
            console.log("Backend server is runnig")
        }))
        .catch((err)=>{console.log(err)});

app.use(cors())
app.use(express.json());

app.use("/api/user", userRoute)
app.use("/api/auth", authRoute)
app.use("/api/booking",slotRoute )
app.use("/api/slot",createStudioRoute)
app.use("/api/program", programRoute)
