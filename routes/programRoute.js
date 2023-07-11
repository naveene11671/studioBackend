const router = require('express').Router()
const { addProgram, getPrograms } = require('../controllers/programController')


router.route("/").get(getPrograms).post(addProgram)

module.exports = router