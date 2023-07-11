const router = require('express').Router();
const { verifyTokenAndAuthorization, verifyTokenAndAdmin } = require("./verifyToken")
const User = require('../models/User');
const Slot = require('../models/Slot');
const sendEmail = require('./email');
const mongoose = require('mongoose');
const { oAuth2Client } = require('../middleware/verifyGoogle');
const { google } = require('googleapis');
const bookingDoneTemplateId = process.env.BOOKINGDONEEMAILTEMPLATE
const getTimingNoString = (timingNO) => {
  let time = ""
  switch (timingNO) {
    case 1:
      time = "10-11"
      break;
    case 2:
      time = "11:30-12:30"
      break;
    case 3:
      time = "2-3"
      break;
    case 4:
      time = "3:15-4:15"
      break;
    default:
      return ""
      break;
  }
  return time
}

//in all the routes below we have used verifyTokenAnd... middleware which are imported from a file, which basically calls next fxn after getting jsonwebtoken from the headers and verifying it. if next fxn within them is called then the async fxn get it's turn to run
// program to get a random item from an array

function getRandomItem(arr) {

  // get random index value
  const randomIndex = Math.floor(Math.random() * arr.length);

  // get random item
  const item = arr[randomIndex];

  return item;
}

// random slot number from type, used in reserve booking
const getRandomSlotNumberFromType = (type, timingNo) => {
  let slotNos = []
  if (type == 'numerical') {

    switch (timingNo) {
      case 1:
        slotNos = [41]
        break;
      case 2:
        slotNos = [42]
        break;

      case 3:
        slotNos = [43]
        break;

      case 4:
        slotNos = [44]
        break;
      default:
        slotNos = [41]
        break;
    }

  } else if (type == 'theory') {

    switch (timingNo) {
      case 1:
        slotNos = [11, 21, 31]
        break;
      case 2:
        slotNos = [12, 22, 32]
        break;
      case 3:
        slotNos = [13, 23, 33]
        break;

      case 4:
        slotNos = [14, 24, 34]
        break;
      default:
        slotNos = [11, 21, 31]
        break;
    }
  }
  const randomSlotNo = getRandomItem(slotNos)
  return randomSlotNo;
}

const createEvent = async (refreshToken, dateString, startTimeString, endTimeSting, description,res) => {
  try {
    // oAuth2Client.setCredentials({ refresh_token: refreshToken })
    // const calendar = google.calendar('v3')
    // const response = await calendar.events.insert({
    //     auth: oAuth2Client,
    //     calendarId: 'primary',
    //     requestBody: {
    //         summary: 'This is a summary for the event',
    //         description: 'This is the description',
    //         location: 'Chandigarh University',
    //         colorId: '7',
    //         start: {
    //             dateTime: new Date("2023-07-03 14:30:00")
    //         },
    //         end: {
    //             dateTime: new Date("2023-07-03 15:15:00")
    //         }
    //     }
    // })
    // res.json(response)
    oAuth2Client.setCredentials({ refresh_token: refreshToken })
    const calendar = google.calendar('v3')
    const response = await calendar.events.insert({
      auth: oAuth2Client,
      calendarId: 'primary',
      requestBody: {
        summary: 'Studio Ticket',
        description: description,
        location: 'Chandigarh University',
        colorId: '7',
        start: {
          dateTime: new Date(`${dateString} ${startTimeString}`)
        },
        end: {
          dateTime: new Date(`${dateString} ${endTimeSting}`)
        }
      }
    })
  } catch (error) {
    res.status(400).json({ msg: error.message })
  }
}

const getStartTimeFromTimingNo = (timingNo) => {
  let startTime = ''
  switch (timingNo) {
    case 1:
      startTime = '10:00:00'
      break;
    case 2:
      startTime = '11:30:00'
      break;
    case 3:
      startTime = '14:00:00'
      break;
    case 4:
      startTime = '15:15:00'
      break;
    default:
      break;
  }
  return startTime
}
const getEndTimeFromTimingNo = (timingNo) => {
  let endTime = ''
  switch (timingNo) {
    case 1:
      endTime = '11:00:00'
      break;
    case 2:
      endTime = '12:30:00'
      break;
    case 3:
      endTime = '13:00:00'
      break;
    case 4:
      endTime = '16:15:00'
      break;
    default:
      break;
  }
  return endTime
}
//create a booking
router.post("/", async (req, res, next) => {
  try {
    const availableSlots = await Slot.find({
      "type": req.body.type,
      "timingNo": req.body.timingNo,
      'slotBookingsData.date': { $ne: new Date(req.body.slotBookingData.date) }
    })
    if (!availableSlots.length) {
      const randomSlotNo = getRandomSlotNumberFromType(req.body.type, req.body.timingNo)

      //getting waiting number
      const queueDataNumber = await Slot.aggregate([
        {
          '$match': {
            'slotNo': randomSlotNo
          }
        }, {
          '$unwind': {
            'path': '$queueData.slotBookingsData'
          }
        }, {
          '$match': {
            'queueData.slotBookingsData.date': new Date(req.body.slotBookingData.date)
          }
        }, {
          '$sort': {
            'queueData.slotBookingsData.bookedAt': 1
          }
        }, {
          $project: {
            'queueData': 1,
            '_id': 0
          }
        }
      ])
      const newWaitingNumber = queueDataNumber.length + 1
      const queueBookingData = { ...req.body.slotBookingData, waitingNo: newWaitingNumber }

      //create reserve booking
      await Slot.findOneAndUpdate({
        slotNo: randomSlotNo
      }, {
        $push: {
          "queueData.slotBookingsData": queueBookingData
        }
      })

      return res.status(201).json({ msg: `reserve booking has been made in studio ${Math.trunc(randomSlotNo / 10)} and slot ${randomSlotNo % 10}`, waitingNo: newWaitingNumber })
    }
    const slotNos = availableSlots.map(slot => slot.slotNo)
    const randomSlotNo = getRandomItem(slotNos)

    const updatedSlot = await Slot.findOneAndUpdate(
      {
        "slotNo": randomSlotNo,
        'slotBookingsData.date': { $ne: new Date(req.body.slotBookingData.date) }
      },
      {
        $push: {
          "slotBookingsData": req.body.slotBookingData
        },
      }, { new: true }
    );
    const subject = `Studio Booking confirmed`


    const dynamicTemplateData = {
      email: req.body.email,
      type: req.body.type,
      date: req.body.slotBookingData.date,
      program: req.body.slotBookingData.program,
      timing: getTimingNoString(req.body.timingNo),
      slotNo: Math.trunc(randomSlotNo / 10),
    }
    await sendEmail(req, res, req.body.email, subject, bookingDoneTemplateId, dynamicTemplateData)
    const user = await User.findOne({ email: req.body.email })
    const refresToken = user.refreshTokenGoogle
    await createEvent(refresToken, req.body.slotBookingData.date, getStartTimeFromTimingNo(req.body.timingNo), getEndTimeFromTimingNo(req.body.timingNo))
    res.status(200).json(`booking has been made in studio ${Math.trunc(randomSlotNo / 10)} and slot ${randomSlotNo % 10}`)
  } catch (err) {
    res.status(401).json("there is error in backend code or postman query");
    console.log(err)
  }
})

//bulk booking
router.post("/bulk", async (req, res) => {
  let updateQuery = {
    slotNo: { $in: req.body.slotNos },
    'slotBookingsData.date': { $ne: new Date(req.body.slotBookingData.date) }
  }
  try {
    const bookings = await Slot.updateMany(
      updateQuery
      , {
        $push: {
          slotBookingsData: req.body.slotBookingData
        }
      })
    res.status(200).json(`booking has been made in studio`)
  } catch (error) {
    console.log(error)
    res.status(500).json({ msg: error.message })
  }
})

//create a reserve booking
router.post("/reserve", async (req, res) => {
  try {
    const availableSlots = await Slot.find({
      "type": req.body.type,
      "timingNo": req.body.timingNo,
      'slotBookingsData.date': { $ne: new Date(req.body.slotBookingData.date) }
    })

    if (!availableSlots.length) {
      const randomSlotNo = getRandomSlotNumberFromType(req.body.type, req.body.timingNo)

      //getting waiting number
      const queueDataNumber = await Slot.aggregate([
        {
          '$match': {
            'slotNo': randomSlotNo
          }
        }, {
          '$unwind': {
            'path': '$queueData.slotBookingsData'
          }
        }, {
          '$match': {
            'queueData.slotBookingsData.date': new Date(req.body.slotBookingData.date)
          }
        }, {
          '$sort': {
            'queueData.slotBookingsData.bookedAt': 1
          }
        }, {
          $project: {
            'queueData': 1,
            '_id': 0
          }
        }
      ])
      const newWaitingNumber = queueDataNumber.length + 1
      const queueBookingData = { ...req.body.slotBookingData, waitingNo: newWaitingNumber }

      //create reserve booking
      await Slot.findOneAndUpdate({
        slotNo: randomSlotNo
      }, {
        $push: {
          "queueData.slotBookingsData": queueBookingData
        }
      })

      return res.status(201).json({ msg: `reserve booking has been made in studio ${Math.trunc(randomSlotNo / 10)} and slot ${randomSlotNo % 10}`, waitingNo: newWaitingNumber })
    }

    const slotNos = availableSlots.map(slot => slot.slotNo)
    const randomSlotNo = getRandomItem(slotNos)

    const updatedSlot = await Slot.findOneAndUpdate(
      {
        "slotNo": randomSlotNo,
        'slotBookingsData.date': { $ne: new Date(req.body.slotBookingData.date) }
      },
      {
        $push: {
          "slotBookingsData": req.body.slotBookingData
        },
      }, { new: true }
    );

    res.status(200).json(`booking has been made in studio ${Math.trunc(randomSlotNo / 10)} and slot ${randomSlotNo % 10}`)

  } catch (error) {
    console.log(error)
    res.status(500).json(error)
  }
})

router.post("/reserve/find", async (req, res) => {
  try {
    const reserveBookings = await Slot.findOne({ 'slotNo': req.body.slotNo, 'queueData.slotBookingsData.userEmail': req.body.userEmail }, { queueData: 1 })
    res.status(200).json(reserveBookings)
  } catch (error) {
    res.status(500).json(error)
  }
})

router.post("/reserve/history", async (req, res) => {
  try {
    const reservedBookings = await Slot.aggregate([
      {
        '$unwind': {
          'path': '$queueData.slotBookingsData'
        }
      }, {
        '$match': {
          'queueData.slotBookingsData.userEmail': req.body.userEmail,
          'queueData.slotBookingsData.date': {
            '$gte': new Date(req.body.dateString)
          }
        }
      }, {
        '$sort': {
          'queueData.slotBookingsData.date': 1,
          'queueData.slotBookingsData.bookedAt': 1
        }
      }, {
        $project: {
          _id: 0,
          bookings: '$queueData.slotBookingsData',
          slotNo: 1,
          studioNo: 1,
          type: 1,
          timingNo: 1
        }
      }
    ])
    res.status(201).json({ count: reservedBookings.length, bookings: reservedBookings })
  } catch (error) {
    res.status(500).json({ msg: error.message })
  }
})

router.post("/reserve/update", async (req, res) => {
  try {
    const reserveBookings = await Slot.findOneAndUpdate({ slotNo: req.body.slotNo }, {
      $pop: {
        queueData: -1
      }
    }, { new: true }).select({ queueData: 1 })
    res.status(200).json(reserveBookings)
  } catch (error) {
    res.status(500).json(error)
  }
})

//delete reserve booking
router.post("/reserve/delete", async (req, res) => {
  try {
    //remove from queueData
    await Slot.findOneAndUpdate({
      'slotNo': req.body.slotNo,
    }, {
      $pull: {
        "queueData.slotBookingsData": { waitingNo: req.body.waitingNo, date: new Date(req.body.date) }
      }
    })

    //update waiting numbers of every other booking
    await Slot.findOneAndUpdate({
      'slotNo': req.body.slotNo,
    }, {
      $inc: {
        'queueData.slotBookingsData.$[elem].waitingNo': -1
      }
    }, {
      arrayFilters: [{ "elem.date": { $eq: new Date(req.body.date) }, "elem.waitingNo": { $gt: req.body.waitingNo } }]
    }
    )

    res.status(201).json({ msg: "reseve booking deleted" })
  } catch (error) {
    res.status(500).json({ msg: error.message })
  }
})

//admin create a booking
router.post("/admin", async (req, res, next) => {
  try {
    const updatedSlot = await Slot.findOneAndUpdate(
      {
        "slotNo": req.body.slotNo,
        'slotBookingsData.date': { $ne: new Date(req.body.slotBookingData.date) }
      },
      {
        $push: {
          "slotBookingsData": req.body.slotBookingData
        }
      }, { new: true }
    );
    const subject = `Studio Booking confirmed`


    const dynamicTemplateData = {
      email: req.body.email,
      type: updatedSlot.type,
      date: req.body.slotBookingData.date,
      program: req.body.slotBookingData.program,
      timing: getTimingNoString(updatedSlot.timingNo),
      slotNo: Math.trunc(updatedSlot.slotNo / 10),
    }
    await sendEmail(req, res, req.body.email, subject, bookingDoneTemplateId, dynamicTemplateData)
    res.status(200).json({ msg: `booking has been made in studio ${Math.trunc(req.body.slotNo / 10)} and slot ${req.body.slotNo % 10}`, studio: Math.trunc(req.body.slotNo / 10), slot: (req.body.slotNo % 10), type: updatedSlot.type })
  } catch (err) {
    res.status(302).json("This slot already booked or there is some error in backend");
    console.log(err)
  }
})


//get booking on a particular date
router.post("/status", async (req, res) => {
  try {
    const slots = await Slot.find({ 'slotBookingsData.date': { $eq: new Date(req.body.date) } });
    const slotNos = slots.map(slot => slot.slotNo)
    res.status(200).json(slotNos)
  } catch (err) {
    console.log(err)
  }
})

//get booking on a particular date and particular type
router.post("/status/:type", async (req, res) => {
  try {
    const slots = await Slot.find({
      'slotBookingsData.date': { $eq: new Date(req.body.date) },
      'type': { $eq: req.params.type }
    });

    const slotNos = slots.map(slot => slot.slotNo)
    res.status(200).json(slotNos)
  } catch (err) {
    console.log(err)
    res.status(401).json({ msg: "there is some error", err: err.message })
  }
})

//deprecated
// router.put("/update", async (req, res) => {
//   try {
//     await Slot.findOneAndUpdate({ slotNo: req.body.slotNo }, { timingNo: req.body.timingNo })
//     res.status(201).json({ msg: "slot updates successully" })
//   } catch (error) {
//     res.status(401).json({ msg: "there is some error", err: error.message })
//   }
// })

router.post("/delete", async (req, res) => {
  try {
    //slot data from queue if it exist
    const slotDataqueue = await Slot.find({
      studioNo: req.body.studioNo, timingNo: req.body.timingNo
    }, {
      "queueData.slotBookingsData": {
        "$filter": {
          "input": "$queueData.slotBookingsData",
          "cond": {
            $and: [
              {
                "$eq": [
                  "$$this.waitingNo",
                  1
                ]
              },
              {
                "$eq": [
                  "$$this.date",
                  new Date(req.body.date)
                ]
              }
            ]
          }
        }
      },
    })


    //delete existing booking
    await Slot.findOneAndUpdate({ studioNo: req.body.studioNo, timingNo: req.body.timingNo }, {
      $pull: {
        slotBookingsData: { date: req.body.date }
      }
    })
    console.log(slotDataqueue)
    if (slotDataqueue[0].queueData.slotBookingsData.length != 0) {

      //push first waiting to bookingsData except waitingNo
      const { waitingNo, ...data } = slotDataqueue[0].queueData.slotBookingsData[0]

      await Slot.findOneAndUpdate({
        studioNo: req.body.studioNo, timingNo: req.body.timingNo
      }, {
        $push: {
          slotBookingsData: data
        }
      })

      //remove from queueData
      await Slot.findOneAndUpdate({
        studioNo: req.body.studioNo, timingNo: req.body.timingNo
      }, {
        $pull: {
          "queueData.slotBookingsData": { waitingNo: 1, date: new Date(req.body.date) }
        }
      })

      //update waiting numbers of every other booking
      await Slot.findOneAndUpdate({
        studioNo: req.body.studioNo, timingNo: req.body.timingNo
      }, {
        $inc: {
          'queueData.slotBookingsData.$[elem].waitingNo': -1
        }
      }, {
        arrayFilters: [{ "elem.date": { $eq: new Date(req.body.date) }, "elem.waitingNo": { $gt: 1 } }]
      }
      )
    }
    res.json({ msg: "done", slotDataqueue })
  } catch (error) {
    console.log(error)
    res.json({ msg: "there is some error", err: error.message })
  }
})

router.post("/history", async (req, res) => {
  let typeOfHistoryQuery = {}
  if (req.body.bookingsType == "upcoming") {
    typeOfHistoryQuery = { $gt: new Date(req.body.dateString) }
  } else if (req.body.bookingsType == "past") {
    typeOfHistoryQuery = { $lt: new Date(req.body.dateString) }
  } else if (req.body.bookingsType == "today") {
    typeOfHistoryQuery = { $eq: new Date(req.body.dateString) }
  } else {
    const defaultQuery = { $gte: new Date(req.body.dateSring) }
    typeOfHistoryQuery = defaultQuery
  }
  try {
    const bookings = await Slot.aggregate([{
      '$unwind': {
        'path': '$slotBookingsData'
      }
    }, {
      '$match': {
        'slotBookingsData.userEmail': req.body.userEmail,
        'slotBookingsData.date': typeOfHistoryQuery
      }
    }, {
      $project: {
        slotBookingsData: 1, slotNo: 1, studioNo: 1, type: 1, timingNo: 1, _id: 0
      }
    },
    {
      $sort: {
        "slotBookingsData.date": 1,
        "slotBookingsData.bookedAt": 1
      }
    }])
    res.status(201).json({ count: bookings.length, bookings })
  } catch (error) {
    res.status(401).json({ msg: 'there is some error', err: error.message })

  }
})

// all bookings data admin
router.post("/find", async (req, res) => {
  try {
    const bookings = await Slot.aggregate([
      {
        '$unwind': {
          'path': '$slotBookingsData'
        }
      }, {
        '$match': {
          'slotBookingsData.date': {
            $gte: new Date(req.body.dateString)
          }
        }
      },
      {
        $project: {
          slotBookingsData: 1, slotNo: 1, studioNo: 1, type: 1, timingNo: 1, _id: 0, user_docs: 1
        }
      },
      {
        $sort: {
          "slotBookingsData.date": -1
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'slotBookingsData.userEmail',
          foreignField: 'email',
          as: 'user_doc',
          pipeline: [{ "$project": { "name": 1, "lastname": 1, "email": 1, "role": 1 } }]
        }
      },
      {
        $unwind: {
          path: '$user_doc'
        }
      }
    ])

    res.json({ count: bookings.length, bookings })
  } catch (error) {
    res.json(error.message)
  }
})

//end the booking
router.post("/end", async (req, res) => {
  try {
    const booking = await Slot.findOneAndUpdate({})
  } catch (error) {

  }
})

module.exports = router