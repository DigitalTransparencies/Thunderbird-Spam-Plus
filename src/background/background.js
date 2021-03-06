'use strict'
import { SCORE_ARRAY, SCORE_REGEX, CUSTOM_SCORE_REGEX } from '../constants.js'
import { getBounds, scoreInterpolation } from '../functions.js'

/**
 * @type {StorageArea}
 */
const localStorage = messenger.storage.local

/**
 * Functions
 */

/**
 * [dlh2] TODO: How we should deal with multiple scores?
 * We can treat them as just scores then making an average or retrieving every score
 * @param {object} headers
 * @returns {string[]} Score value
 */
function getScores(headers) {
  const scores = []
  // Get Custom Mail Headers
  const auxHeaders = Object.entries(headers).filter(([key, value]) => key.startsWith('x-'))
  // Remove Mozilla Headers
  const auxHeadersNoMozilla = auxHeaders.filter(([key, value]) => !key.startsWith('x-mozilla'))
  const customHeaders = Object.fromEntries(auxHeadersNoMozilla)
  for (const headerName in customHeaders) {
    if (SCORE_ARRAY.includes(headerName)) {
      // dlh2: There's gotta be simpler code for this ~_~
      const scoreField = customHeaders[headerName][0].match(SCORE_REGEX[headerName])
      if (!scoreField) continue // If no match iterate
      const score = scoreInterpolation(headerName, scoreField[1])
      scores.push(score)
    } else {
      for (const regExName in CUSTOM_SCORE_REGEX) {
        if (headerName.endsWith(regExName)) {
          const scoreField = customHeaders[headerName][0].match(CUSTOM_SCORE_REGEX[regExName])
          if (!scoreField) continue // If no match iterate
          const score = scoreInterpolation(headerName, scoreField[1])
          scores.push(score)
        }
      }
    }
  }
  return scores
}

/**
 * Returns the path of the image
 * @param {string} score
 * @returns {string} Path of Image
 */
async function getImageSrc(score) {
  const storage = await localStorage.get(['scoreIconLowerBounds', 'scoreIconUpperBounds'])
  const [lowerBounds, upperBounds] = getBounds(storage)
  if (score > upperBounds) return '/images/score_positive.svg'
  else if (score <= upperBounds && score >= lowerBounds) return '/images/score_neutral.svg'
  else if (score < lowerBounds) return '/images/score_negative.svg'
  else return '/images/score_neutral.svg'
}

/**
 * Executed everytime a message is displayed
 * @param {Tab} tab
 * @param {MessageHeader} message
 */
async function onMessageDisplayed(tab, message) {
  // Declaration / Values
  const idTab = tab.id
  const fullMessage = await messenger.messages.getFull(message.id)
  const messageButton = messenger.messageDisplayAction

  // Get Score
  const scores = getScores(fullMessage.headers) // Get Scores
  const score = isNaN(scores[0]) ? null : scores[0] // THIS CODE IS BAD, deciding on next commit

  // Message Score Button
  if (score === null) {
    messageButton.disable(idTab)
  } else {
    messageButton.enable(idTab)
    messageButton.setTitle({ tabId: idTab, title: 'Spam Score: ' + score })
    messageButton.setIcon({ path: await getImageSrc(score) })
  }

  // Save Custom Name Header for... something of the Dynamic custom headers.
  for (const regExName in CUSTOM_SCORE_REGEX) {
    const headersFound = Object.entries(fullMessage.headers).filter(([key, value]) => key.endsWith(regExName))
    // I think we need to deal it in another way, it could be that there's other emails that could end the same way.
    for (const headerFound of headersFound) {
      const headerName = headerFound[0] // header [Header Name, Header Value]
      // Note: The header is always lowercase in messages.getFull
      const storage = await localStorage.get(['customMailscannerHeaders'])
      const customHeaders = storage.customMailscannerHeaders
      if (!customHeaders || (customHeaders && !customHeaders.includes(headerName))) {
        // This thing is what it makes us restart Thunderbird & Repair Folder
        await messenger.SpamScores.addDynamicCustomHeaders([headerName])
        localStorage.set({ customMailscannerHeaders: [...(customHeaders || []), headerName] })
      }
    }
  }
}

/**
 * Fired when the displayed folder changes in any mail tab.
 * @param {Tab} tab
 * @param {MailFolder} displayedFolder
 */
async function onDisplayedFolderChanged(tab, displayedFolder) {
  const spamScores = messenger.SpamScores
  // Do not try to use addon on Root
  if (displayedFolder.path !== '/') {
    const win = await messenger.windows.getCurrent()
    spamScores.repaint(win.id)
  } else {
    // Cleans in case we go to root
    spamScores.clear()
  }
}

/**
 * Executed when you press the "Delete Spam Button"
 * @param {*} tab
 * @param {*} info
 */
async function onClicked(tab, info) {
  const idsDeleteMail = []
  const accounts = await messenger.accounts.list(false)
  for (const account of accounts) {
    // Spam should be detected on inbox folders and junk folders
    const mailFolders = await recursiveGetSubFolders(account)
    // Filter so we only get inbox / junk type
    const mailInboxes = mailFolders.filter(
      auxMailFolder => auxMailFolder.type && ['inbox', 'junk', 'trash'].includes(auxMailFolder.type)
    )
    for (const mailInbox of mailInboxes) {
      let mailList = await messenger.messages.list(mailInbox)
      for (const mail of mailList.messages) {
        const fullMessage = await messenger.messages.getFull(mail.id)
        // Get Score
        const scores = getScores(fullMessage.headers) // Get Scores
        if (scores.length > 0) {
          const score = parseFloat(scores[0])
          if (score > 3) idsDeleteMail.push(mail.id)
        }
      }
      while (mailList.id) {
        mailList = await messenger.messages.continueList(mailList.id)
        for (const mail of mailList.messages) {
          const fullMessage = await messenger.messages.getFull(mail.id)
          // Get Score
          const scores = getScores(fullMessage.headers) // Get Scores
          if (scores.length > 0) {
            const score = parseFloat(scores[0])
            if (score > 3) idsDeleteMail.push(mail.id)
          }
        }
      }
    }
  }
  messenger.messages.delete(idsDeleteMail, true)
}

async function recursiveGetSubFolders(folderAccount, holder = []) {
  const folders = await messenger.folders.getSubFolders(folderAccount, true)
  for (const folder of folders) {
    holder.push(folder)
    for (const subfolder of folder.subFolders) {
      holder.push(subfolder)
      await recursiveGetSubFolders(subfolder, holder)
    }
  }
  return holder
}

function browserButton() {
  const btnBrowser = messenger.browserAction
  btnBrowser.enable()
  // btnBrowser.setIcon()
  btnBrowser.onClicked.addListener(onClicked)
}

/**
 * Main
 */
const init = async () => {
  // Declaration / Values
  const spamScores = messenger.SpamScores
  const storage = await localStorage.get([
    'scoreIconLowerBounds',
    'scoreIconUpperBounds',
    'customMailscannerHeaders',
    'hideIconScorePositive',
    'hideIconScoreNeutral',
    'hideIconScoreNegative',
    'hello'
  ])

  // Hello Message
  if (!storage.hello) {
    messenger.windows.create({
      height: 680,
      width: 488,
      url: '/src/static/hello.html',
      type: 'popup'
    })
    localStorage.set({ hello: true })
  }

  // BrowserButton
  browserButton()

  // Add Listeners
  messenger.messageDisplay.onMessageDisplayed.addListener(onMessageDisplayed)
  messenger.mailTabs.onDisplayedFolderChanged.addListener(onDisplayedFolderChanged)

  // Init Data
  const [lowerBounds, upperBounds] = getBounds(storage)
  spamScores.setScoreBounds(lowerBounds, upperBounds)

  if (storage.customMailscannerHeaders) {
    spamScores.setCustomMailscannerHeaders(storage.customMailscannerHeaders)
  }
  spamScores.setHideIconScoreOptions(
    storage.hideIconScorePositive || false,
    storage.hideIconScoreNeutral || false,
    storage.hideIconScoreNegative || false
  )
}
init()
