import { button, form, input, label, small, span } from "../../utils/dom.js";
import { megaEdit } from "../../utils/mega_editor.js";
import {
  createBlogSpan,
  modalCancelButton,
  modalCompleteButton,
  showErrorModal,
  showModal,
} from "../../utils/modals.js";
import { addSidebarItem, removeSidebarItem } from "../../utils/sidebar.js";
import { dateTimeFormat } from "../../utils/text_format.js";
import { apiFetch } from "../../utils/tumblr_helpers.js";

const timezoneOffsetMs = new Date().getTimezoneOffset() * 60000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createNowString = () => {
  const now = new Date();

  const YYYY = `${now.getFullYear()}`.padStart(4, "0");
  const MM = `${now.getMonth() + 1}`.padStart(2, "0");
  const DD = `${now.getDate()}`.padStart(2, "0");
  const hh = `${now.getHours()}`.padStart(2, "0");
  const mm = `${now.getMinutes()}`.padStart(2, "0");

  return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
};

const showDeletePostsPrompt = () => {
  const formElement = form(
    { id: "xkit-mass-deleter-delete-posts", submit: confirmDeletePosts },
    [
      label({}, [
        "Delete posts before:",
        input({
          type: "datetime-local",
          name: "before",
          value: createNowString(),
          required: true,
        }),
      ]),
    ],
  );

  showModal({
    title: "Mass Deleter",
    message: [formElement],
    buttons: [
      modalCancelButton,
      input({
        type: "submit",
        form: formElement.id,
        class: "blue",
        value: "Next",
      }),
    ],
  });
};

const confirmDeletePosts = (event) => {
  event.preventDefault();

  const blogName = location.pathname.split("/")[2];
  const { elements } = event.currentTarget;
  const beforeMs = elements.before.valueAsNumber + timezoneOffsetMs;

  const beforeString = dateTimeFormat.format(new Date(beforeMs));
  const beforeElement = span(
    { style: "white-space: nowrap; font-weight: bold;" },
    [beforeString],
  );

  const before = beforeMs / 1000;

  showModal({
    title: "Delete posts?",
    message: [
      "Every post on ",
      createBlogSpan(blogName),
      " dated before ",
      beforeElement,
      " will be deleted.",
    ],
    buttons: [
      modalCancelButton,
      button(
        {
          class: "red",
          click: () => deletePosts({ blogName, before }).catch(showErrorModal),
        },
        ["Delete them!"],
      ),
    ],
  });
};

const deletePosts = async function ({ blogName, before }) {
  const foundPostsElement = span({}, ["Gathering posts..."]);
  const deleteCountElement = span();

  showModal({
    title: "Deleting posts...",
    message: [
      small({}, ["Do not navigate away from this page."]),
      "\n\n",
      foundPostsElement,
      "\n",
      deleteCountElement,
    ],
  });

  let fetchedPosts = 0;
  const drafts = [];
  let resource = `/v2/blog/${blogName}/posts?limit=50`;

  while (resource) {
    await Promise.all([
      apiFetch(resource).then(({ response }) => {
        const posts = response.posts.filter(({ canEdit }) => canEdit === true);

        fetchedPosts += response.posts.length;
        drafts.push(...posts.filter(({ timestamp }) => timestamp < before));

        resource = response.links?.next?.href;

        foundPostsElement.textContent = `Found ${drafts.length} posts (checked ${fetchedPosts})${resource ? "..." : "."}`;
      }),
      sleep(1000),
    ]);
  }

  const draftIds = drafts.map(({ id }) => id);
  if (draftIds.length === 0) {
    showNoDraftsError();
    return;
  }

  let deleteCount = 0;
  let failCount = 0;

  deleteCountElement.textContent = "Deleting posts...";

  while (draftIds.length !== 0) {
    const postIds = draftIds.splice(0, 100);
    await Promise.all([
      megaEdit(postIds, { mode: "delete" })
        .then(() => {
          deleteCount += postIds.length;
        })
        .catch(() => {
          failCount += postIds.length;
        })
        .finally(() => {
          deleteCountElement.textContent = `Deleted ${deleteCount} posts... ${failCount ? `(failed: ${failCount})` : ""}`;
        }),
      sleep(1000),
    ]);
  }

  showModal({
    title: "All done!",
    message: [
      `Deleted ${deleteCount} posts. ${failCount ? `(failed: ${failCount})` : ""}\n`,
      "Refresh the page to see the result.",
    ],
    buttons: [
      button({ class: "blue", click: () => location.reload() }, ["Refresh"]),
    ],
  });
};

const showNoPostsError = () =>
  showModal({
    title: "Nothing to delete!",
    message: ["No posts found for the specified time range."],
    buttons: [modalCompleteButton],
  });

const deletePostsSidebarOptions = {
  id: "mass-deleter-delete-posts",
  title: "Mass Published Post Deleter",
  rows: [
    {
      label: "Delete posts",
      onclick: showDeletePostsPrompt,
      carrot: true,
    },
  ],
  visibility: () => true,
};

export const main = async function () {
  addSidebarItem(deletePostsSidebarOptions);
};

export const clean = async function () {
  removeSidebarItem(deletePostsSidebarOptions.id);
};
